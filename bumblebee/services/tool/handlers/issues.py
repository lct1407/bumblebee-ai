"""Tool handlers for Issue domain — list/get/create/update."""
from __future__ import annotations
import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.models.issue import Issue, IssueStatus
from bumblebee.models.project import Project
from bumblebee.services.state.event_log import append_event
from bumblebee.services.tool.result import ToolResult


async def list_issues(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    slug = args.get("project_slug", "bb")
    proj = (await db.execute(select(Project).where(Project.slug == slug))).scalar_one_or_none()
    if not proj:
        return ToolResult.err(f"project_not_found: {slug}")
    stmt = select(Issue).where(Issue.project_id == proj.id, Issue.deleted_at.is_(None))
    if status := args.get("status"):
        stmt = stmt.where(Issue.status == IssueStatus(status))
    stmt = stmt.order_by(Issue.number.desc()).limit(20)
    items = (await db.execute(stmt)).scalars().all()
    return ToolResult.ok(
        f"{len(items)} issues",
        artifacts=[f"BB-{i.number}" for i in items],
        data={"issues": [{"number": i.number, "title": i.title, "status": i.status.value} for i in items]},
    )


async def get_issue(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    issue_id = args["issue_id"]
    try:
        iid = uuid.UUID(issue_id)
    except ValueError:
        return ToolResult.err(f"invalid_uuid: {issue_id}")
    issue = await db.get(Issue, iid)
    if not issue:
        return ToolResult.err(f"issue_not_found: {issue_id}")
    return ToolResult.ok(
        f"BB-{issue.number}: {issue.title}",
        artifacts=[f"BB-{issue.number}"],
        data={
            "id": str(issue.id),
            "number": issue.number,
            "title": issue.title,
            "description": issue.description,
            "status": issue.status.value,
            "type": issue.type.value,
            "priority": issue.priority.value,
            "scope_hints": issue.scope_hints,
            "acceptance_criteria": issue.acceptance_criteria,
        },
    )


async def create_issue(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    slug = args["project_slug"]
    proj = (await db.execute(select(Project).where(Project.slug == slug))).scalar_one_or_none()
    if not proj:
        return ToolResult.err(f"project_not_found: {slug}")
    max_num = (
        await db.execute(
            select(func.coalesce(func.max(Issue.number), 0)).where(Issue.project_id == proj.id)
        )
    ).scalar() or 0
    issue = Issue(
        project_id=proj.id,
        number=max_num + 1,
        title=args["title"],
        description=args.get("description"),
        scope_hints=args.get("scope_hints", []),
    )
    db.add(issue)
    await db.flush()
    await append_event(
        db,
        type="status_change",
        issue_id=issue.id,
        project_id=proj.id,
        payload={"from": None, "to": "new"},
        source="agent",
        actor=session.role,
    )
    return ToolResult.ok(
        f"created BB-{issue.number}: {issue.title}",
        artifacts=[f"BB-{issue.number}"],
        data={"id": str(issue.id), "number": issue.number},
    )


async def update_issue_status(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    iid = uuid.UUID(args["issue_id"])
    new_status = IssueStatus(args["status"])
    issue = await db.get(Issue, iid)
    if not issue:
        return ToolResult.err(f"issue_not_found")
    old = issue.status
    issue.status = new_status
    await append_event(
        db,
        type="status_change",
        issue_id=iid,
        project_id=issue.project_id,
        payload={"from": old.value, "to": new_status.value},
        source="agent",
        actor=session.role,
    )
    return ToolResult.ok(f"BB-{issue.number}: {old.value} -> {new_status.value}")


def register(executor) -> None:
    executor.register("list_issues", list_issues)
    executor.register("get_issue", get_issue)
    executor.register("create_issue", create_issue)
    executor.register("update_issue_status", update_issue_status)
