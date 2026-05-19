"""Replay debugger — Phase 7 stub.

Loads event log for a session; replays via canned provider (stub).
Full deterministic replay (claude-cli with same seed) deferred.
"""
from __future__ import annotations
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.services.state.event_log import get_events_for_session


async def replay_session(
    db: AsyncSession, session_id: uuid.UUID
) -> dict:
    """Return events as a replay trace. Phase 7 scope: read-only event reconstruction.

    Real re-execution with provider=replay deferred to Phase 7.5+.
    """
    events = await get_events_for_session(db, session_id)
    return {
        "session_id": str(session_id),
        "event_count": len(events),
        "trace": [
            {
                "type": e.type,
                "occurred_at": e.occurred_at.isoformat(),
                "actor": e.actor,
                "payload_keys": list(e.payload.keys()) if e.payload else [],
            }
            for e in events
        ],
    }


async def diff_replay(
    db: AsyncSession, session_a_id: uuid.UUID, session_b_id: uuid.UUID
) -> dict:
    """Compare 2 session traces; return divergence point."""
    a = await get_events_for_session(db, session_a_id)
    b = await get_events_for_session(db, session_b_id)
    diverge_at = None
    for i, (ea, eb) in enumerate(zip(a, b)):
        if ea.type != eb.type:
            diverge_at = {"index": i, "a_type": ea.type, "b_type": eb.type}
            break
    return {
        "session_a": str(session_a_id),
        "session_b": str(session_b_id),
        "a_count": len(a),
        "b_count": len(b),
        "diverged_at": diverge_at,
    }
