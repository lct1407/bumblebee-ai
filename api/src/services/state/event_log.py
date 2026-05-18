"""Event log — append-only canonical record. Plane 4 / State."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.event import Event


async def append_event(
    db: AsyncSession,
    *,
    type: str,
    payload: dict | None = None,
    project_id: uuid.UUID | None = None,
    issue_id: uuid.UUID | None = None,
    session_id: uuid.UUID | None = None,
    chat_session_id: uuid.UUID | None = None,
    workflow_run_id: uuid.UUID | None = None,
    causation_id: uuid.UUID | None = None,
    source: str = "system",
    actor: str | None = None,
    prompt_hash: str | None = None,
) -> Event:
    """Append a new event to the canonical log. Never updates existing rows."""
    event = Event(
        type=type,
        payload=payload or {},
        project_id=project_id,
        issue_id=issue_id,
        session_id=session_id,
        chat_session_id=chat_session_id,
        workflow_run_id=workflow_run_id,
        causation_id=causation_id,
        source=source,
        actor=actor,
        prompt_hash=prompt_hash,
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(event)
    await db.flush()
    return event


async def get_events_for_issue(
    db: AsyncSession, issue_id: uuid.UUID, limit: int = 1000
) -> list[Event]:
    stmt = (
        select(Event)
        .where(Event.issue_id == issue_id)
        .order_by(Event.occurred_at.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_events_for_session(
    db: AsyncSession, session_id: uuid.UUID, limit: int = 1000
) -> list[Event]:
    stmt = (
        select(Event)
        .where(Event.session_id == session_id)
        .order_by(Event.occurred_at.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
