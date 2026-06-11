"""Streaming invocation — broadcast LLM chunks over WebSocket (Plane 7).

Chunks are ephemeral (not persisted). Only the final llm_call event hits the DB.
The web UI consumes chunks via /ws and assembles them client-side.
"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.services.execution.context_assembler import Prompt
from bumblebee.services.execution.llm_provider import LLMProvider, LLMResponse


async def invoke_with_streaming(
    db: AsyncSession,
    session: AgentSession,
    role: str,
    provider: LLMProvider,
    prompt: Prompt,
) -> LLMResponse:
    """Run provider.invoke_streaming and broadcast each chunk over WebSocket."""
    from bumblebee.models.issue import Issue
    from bumblebee.models.project import Project
    from bumblebee.services.websocket.manager import get_manager

    # Resolve project slug once
    slug = None
    if session.issue_id:
        iss = (await db.execute(select(Issue).where(Issue.id == session.issue_id))).scalar_one_or_none()
        if iss:
            proj = (await db.execute(select(Project).where(Project.id == iss.project_id))).scalar_one_or_none()
            if proj:
                slug = proj.slug

    mgr = get_manager()
    chunk_seq = 0

    async def on_chunk(chunk: dict) -> None:
        nonlocal chunk_seq
        chunk_seq += 1
        if not slug:
            return
        await mgr.broadcast(slug, {
            "id": f"chunk-{session.id}-{chunk_seq}",
            "type": "llm.chunk",
            "session_id": str(session.id),
            "issue_id": str(session.issue_id) if session.issue_id else None,
            "actor": role,
            "payload": {**chunk, "seq": chunk_seq},
            "occurred_at": datetime.now(UTC).isoformat(),
        })

    # Announce stream start so UI can clear/prepare its buffer
    await on_chunk({"type": "stream_started", "role": role})
    try:
        response = await provider.invoke_streaming(prompt, on_chunk)
    except Exception as exc:
        await on_chunk({"type": "error", "message": str(exc)})
        raise
    await on_chunk({"type": "stream_ended", "role": role})
    return response
