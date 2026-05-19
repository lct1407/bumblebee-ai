"""Tool handlers for ScopeLease acquire/release."""
from __future__ import annotations
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.services.dispatch.lease_manager import acquire_lease, release_lease as _release
from bumblebee.services.tool.result import ToolResult


async def acquire_scope_lease(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    patterns = args["patterns"]
    if not session.issue_id:
        return ToolResult.err("no_issue_context: scope lease requires issue_id on session")
    lease = await acquire_lease(
        db, session_id=session.id, issue_id=session.issue_id, patterns=patterns
    )
    if lease is None:
        return ToolResult.err(
            "conflict: patterns overlap with active lease",
            next_actions=["narrow scope", "wait for release", "request_human_approval"],
        )
    return ToolResult.ok(
        f"granted: {patterns}",
        artifacts=[str(lease.id)],
        data={"lease_id": str(lease.id), "patterns": patterns},
    )


async def release_scope_lease(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    lid = uuid.UUID(args["lease_id"])
    await _release(db, lid)
    return ToolResult.ok(f"released: {lid}")


def register(executor) -> None:
    executor.register("acquire_scope_lease", acquire_scope_lease)
    executor.register("release_scope_lease", release_scope_lease)
