"""ToolExecutor — dispatch tool calls to handlers + emit Events. Plane 6.

Handlers registered in handlers/ submodules. Each returns ToolResult.
"""
from __future__ import annotations
import uuid
from typing import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.services.state.event_log import append_event
from bumblebee.services.tool.registry import TOOLS, validate_tool_call
from bumblebee.services.tool.result import ToolResult

Handler = Callable[[dict, AgentSession, AsyncSession], Awaitable[ToolResult]]


class ToolExecutor:
    """Tool dispatcher. Validates schema, executes handler, emits events."""

    def __init__(self) -> None:
        self._handlers: dict[str, Handler] = {}
        self._register_builtins()

    def register(self, name: str, handler: Handler) -> None:
        self._handlers[name] = handler

    def _register_builtins(self) -> None:
        # Lazy import to avoid circular
        from bumblebee.services.tool.handlers import register_all
        register_all(self)

    async def execute(
        self,
        name: str,
        args: dict,
        session: AgentSession,
        db: AsyncSession,
    ) -> ToolResult:
        # 1. Schema validate
        ok, err = validate_tool_call(name, args)
        if not ok:
            result = ToolResult.err(f"validation_failed: {err}")
            await self._emit(db, session, name, args, result)
            return result

        # 2. Handler lookup
        handler = self._handlers.get(name)
        if handler is None:
            result = ToolResult.err(
                f"no_handler: {name}",
                next_actions=["pick a tool from registry"],
            )
            await self._emit(db, session, name, args, result)
            return result

        # 3. Execute + capture errors
        try:
            result = await handler(args, session, db)
        except Exception as e:
            result = ToolResult.err(
                f"exception: {type(e).__name__}: {e}",
                next_actions=["retry with valid args", "report bug if persistent"],
            )

        # 4. Emit events
        await self._emit(db, session, name, args, result)
        return result

    async def _emit(
        self,
        db: AsyncSession,
        session: AgentSession,
        name: str,
        args: dict,
        result: ToolResult,
    ) -> None:
        # tool_call event
        await append_event(
            db,
            type="tool_call",
            session_id=session.id,
            issue_id=session.issue_id,
            payload={"tool": name, "args": args},
            source="agent",
            actor=session.role,
        )
        # tool_result event
        await append_event(
            db,
            type="tool_result",
            session_id=session.id,
            issue_id=session.issue_id,
            payload={
                "tool": name,
                "status": result.status,
                "summary": result.summary,
                "artifacts": result.artifacts,
            },
            source="agent",
            actor=session.role,
        )


_default_executor: ToolExecutor | None = None


def get_executor() -> ToolExecutor:
    global _default_executor
    if _default_executor is None:
        _default_executor = ToolExecutor()
    return _default_executor
