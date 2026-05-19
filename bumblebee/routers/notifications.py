"""Notification CRUD endpoints — Phase 7."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.notification import Notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    unread_only: bool = Query(False),
    recipient: str | None = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Notification).order_by(Notification.created_at.desc()).limit(limit)
    if unread_only:
        stmt = stmt.where(Notification.is_read == False)
    if recipient:
        stmt = stmt.where(Notification.recipient == recipient)
    items = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(n.id),
            "recipient": n.recipient,
            "type": n.type.value,
            "title": n.title,
            "body": n.body,
            "payload": n.payload,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in items
    ]


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    n = await db.get(Notification, notification_id)
    if not n:
        raise HTTPException(404, "not_found")
    n.is_read = True
    n.read_at = datetime.now(timezone.utc)
    await db.commit()
    return {"id": str(n.id), "is_read": True}


@router.patch("/read-all")
async def mark_all_read(
    recipient: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Notification).where(
        Notification.recipient == recipient, Notification.is_read == False
    )
    items = (await db.execute(stmt)).scalars().all()
    now = datetime.now(timezone.utc)
    for n in items:
        n.is_read = True
        n.read_at = now
    await db.commit()
    return {"updated": len(items)}
