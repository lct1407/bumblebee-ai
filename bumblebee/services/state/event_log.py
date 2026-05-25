"""Event log â€” append-only canonical record. Plane 4 / State."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.event import Event


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
    workspace_id: uuid.UUID | None = None,
    source: str = "system",
    actor: str | None = None,
    prompt_hash: str | None = None,
) -> Event:
    """Append a new event to the canonical log. Never updates existing rows.

    workspace_id is required for workspace-level events (e.g. Stripe billing)
    where no parent issue/project/session exists for the auto-scope listener.
    """
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
        occurred_at=datetime.now(UTC),
    )
    if workspace_id is not None:
        event.workspace_id = workspace_id
    db.add(event)
    await db.flush()
    # Best-effort WS broadcast (non-blocking, ignored on error)
    try:
        from bumblebee.models.project import Project
        from bumblebee.services.websocket.manager import get_manager

        slug = None
        if project_id:
            proj = (
                await db.execute(select(Project).where(Project.id == project_id))
            ).scalar_one_or_none()
            if proj:
                slug = proj.slug
        elif issue_id:
            from bumblebee.models.issue import Issue
            iss = (
                await db.execute(select(Issue).where(Issue.id == issue_id))
            ).scalar_one_or_none()
            if iss:
                proj = (
                    await db.execute(select(Project).where(Project.id == iss.project_id))
                ).scalar_one_or_none()
                if proj:
                    slug = proj.slug
        if slug:
            await get_manager().broadcast(slug, {
                "id": str(event.id),
                "type": event.type,
                "issue_id": str(event.issue_id) if event.issue_id else None,
                "session_id": str(event.session_id) if event.session_id else None,
                "actor": event.actor,
                "payload": event.payload,
                "occurred_at": event.occurred_at.isoformat(),
            })
    except Exception:
        pass
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
