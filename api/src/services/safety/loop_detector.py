"""LoopDetector: structural detection of same-tool-same-args repeats."""
import uuid
from collections import deque
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.event import Event


WINDOW_SIZE = 5  # check last N calls
REPEAT_THRESHOLD = 3  # same tool+args N times → loop


async def detect_loop(db: AsyncSession, session_id: uuid.UUID) -> bool:
    """Return True if loop detected in recent tool calls."""
    stmt = (
        select(Event)
        .where(Event.session_id == session_id, Event.type == "tool_call")
        .order_by(Event.occurred_at.desc())
        .limit(WINDOW_SIZE)
    )
    events = list((await db.execute(stmt)).scalars().all())
    if len(events) < REPEAT_THRESHOLD:
        return False

    # Canonical signature: tool_name + sorted args
    signatures = [
        (e.payload.get("tool"), tuple(sorted((e.payload.get("args") or {}).items())))
        for e in events
    ]

    # Count duplicates
    seen: dict = {}
    for sig in signatures:
        seen[sig] = seen.get(sig, 0) + 1
        if seen[sig] >= REPEAT_THRESHOLD:
            return True
    return False
