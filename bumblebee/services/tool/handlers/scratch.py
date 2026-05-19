"""Tool handlers for session scratchpad (Tier 3 memory)."""
from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.services.tool.result import ToolResult


async def scratch_write(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    key = args["key"]
    value = args["value"]
    scratch = dict(session.scratch or {})
    scratch[key] = value
    session.scratch = scratch
    await db.flush()
    return ToolResult.ok(f"scratch[{key}] persisted")


async def scratch_read(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    key = args["key"]
    val = (session.scratch or {}).get(key)
    if val is None:
        return ToolResult.warn(f"scratch[{key}] not set")
    return ToolResult.ok(f"scratch[{key}] = ...", data={"value": val})


def register(executor) -> None:
    executor.register("scratch_write", scratch_write)
    executor.register("scratch_read", scratch_read)
