"""Event log read API."""
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.event import Event
from bumblebee.schemas.event import EventOut

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventOut])
async def list_events(
    issue_id: uuid.UUID | None = Query(None),
    session_id: uuid.UUID | None = Query(None),
    type: str | None = Query(None),
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[Event]:
    stmt = select(Event).order_by(Event.occurred_at.desc()).limit(limit)
    if issue_id:
        stmt = stmt.where(Event.issue_id == issue_id)
    if session_id:
        stmt = stmt.where(Event.session_id == session_id)
    if type:
        stmt = stmt.where(Event.type == type)
    result = await db.execute(stmt)
    return list(result.scalars().all())
