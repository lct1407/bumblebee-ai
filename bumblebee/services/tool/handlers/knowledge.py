"""Tool handlers for KnowledgeEntry — query + add with usage tracking."""
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.models.issue import Issue
from bumblebee.models.knowledge_entry import KnowledgeEntry, KnowledgeCategory
from bumblebee.services.tool.result import ToolResult


async def query_knowledge(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    category = args.get("category")
    scope_glob = args.get("scope_glob")
    limit = int(args.get("limit", 5))

    # Get project_id via session.issue
    if not session.issue_id:
        return ToolResult.err("no_project_context")
    issue = await db.get(Issue, session.issue_id)
    if not issue:
        return ToolResult.err("issue_missing")

    stmt = select(KnowledgeEntry).where(KnowledgeEntry.project_id == issue.project_id)
    if category:
        stmt = stmt.where(KnowledgeEntry.category == KnowledgeCategory(category))
    stmt = stmt.order_by(
        (KnowledgeEntry.use_count + 1).desc(),
    ).limit(limit)
    entries = (await db.execute(stmt)).scalars().all()

    # Increment use_count + lastUsedAt
    now = datetime.now(timezone.utc)
    for e in entries:
        e.use_count += 1
        e.last_used_at = now

    return ToolResult.ok(
        f"{len(entries)} knowledge entries",
        artifacts=[str(e.id) for e in entries],
        data={
            "entries": [
                {"title": e.title, "category": e.category.value, "body": e.body[:300]}
                for e in entries
            ]
        },
    )


async def add_knowledge(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    if not session.issue_id:
        return ToolResult.err("no_project_context")
    issue = await db.get(Issue, session.issue_id)
    if not issue:
        return ToolResult.err("issue_missing")
    entry = KnowledgeEntry(
        title=args["title"],
        body=args["body"],
        category=KnowledgeCategory(args["category"]),
        tags=args.get("tags", []),
        scope_globs=args.get("scope_globs", []),
        project_id=issue.project_id,
        contributed_by_session_id=session.id,
    )
    db.add(entry)
    await db.flush()
    return ToolResult.ok(
        f"knowledge added: {entry.title[:40]}",
        artifacts=[str(entry.id)],
    )


def register(executor) -> None:
    executor.register("query_knowledge", query_knowledge)
    executor.register("add_knowledge", add_knowledge)
