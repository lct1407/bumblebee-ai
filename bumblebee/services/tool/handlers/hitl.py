"""Tool handlers for HITL (Human-In-The-Loop) — suggest + approval requests."""
from __future__ import annotations
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.models.chat_session import ChatSession
from bumblebee.services.state.event_log import append_event
from bumblebee.services.tool.result import ToolResult


async def suggest_issue(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    """Suggest an issue draft for user approval (HITL chat pattern)."""
    draft = args["draft"]
    draft_id = str(uuid.uuid4())

    # Persist in chat_session.metadata pending_suggestions
    if session.chat_session_id:
        chat = await db.get(ChatSession, session.chat_session_id)
        if chat:
            metadata = dict(chat.chat_metadata or {})
            pending = metadata.get("pending_suggestions", [])
            pending.append({"id": draft_id, "kind": "issue", "draft": draft})
            metadata["pending_suggestions"] = pending
            chat.chat_metadata = metadata
            await db.flush()

    await append_event(
        db,
        type="chat_suggestion",
        chat_session_id=session.chat_session_id,
        session_id=session.id,
        payload={"kind": "issue", "draft_id": draft_id, "draft": draft},
        source="agent",
        actor=session.role,
    )
    return ToolResult.ok(
        f"suggested issue draft. Awaiting user approval. id={draft_id}",
        next_actions=["wait for user approve via UI"],
        artifacts=[draft_id],
    )


async def suggest_knowledge_entry(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    draft = args["draft"]
    draft_id = str(uuid.uuid4())

    if session.chat_session_id:
        chat = await db.get(ChatSession, session.chat_session_id)
        if chat:
            metadata = dict(chat.chat_metadata or {})
            pending = metadata.get("pending_suggestions", [])
            pending.append({"id": draft_id, "kind": "knowledge", "draft": draft})
            metadata["pending_suggestions"] = pending
            chat.chat_metadata = metadata
            await db.flush()

    await append_event(
        db,
        type="chat_suggestion",
        chat_session_id=session.chat_session_id,
        session_id=session.id,
        payload={"kind": "knowledge", "draft_id": draft_id, "draft": draft},
        source="agent",
        actor=session.role,
    )
    return ToolResult.ok(
        f"suggested knowledge entry. id={draft_id}",
        next_actions=["user approves to persist"],
        artifacts=[draft_id],
    )


async def request_human_approval(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    context = args["context"]
    options = args.get("options", ["approve", "reject"])
    await append_event(
        db,
        type="decision_taken",
        session_id=session.id,
        issue_id=session.issue_id,
        payload={"kind": "human_approval_requested", "context": context, "options": options},
        source="agent",
        actor=session.role,
    )
    return ToolResult.ok(
        "human approval requested - session paused",
        next_actions=["wait for human response via UI/CLI"],
    )


def register(executor) -> None:
    executor.register("suggest_issue", suggest_issue)
    executor.register("suggest_knowledge_entry", suggest_knowledge_entry)
    executor.register("request_human_approval", request_human_approval)
