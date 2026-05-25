"""Notification dispatcher — emits notifications on session events."""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.notification import Notification, NotificationType


async def notify_session_completed(
    db: AsyncSession,
    project_id: uuid.UUID,
    recipient: str,
    session_id: uuid.UUID,
    summary: str = "",
) -> Notification:
    n = Notification(
        recipient=recipient,
        type=NotificationType.SESSION_COMPLETED,
        title="Session completed",
        body=summary[:500] if summary else None,
        payload={"session_id": str(session_id)},
        project_id=project_id,
    )
    db.add(n)
    await db.flush()
    return n


async def notify_session_failed(
    db: AsyncSession,
    project_id: uuid.UUID,
    recipient: str,
    session_id: uuid.UUID,
    reason: str,
) -> Notification:
    n = Notification(
        recipient=recipient,
        type=NotificationType.SESSION_FAILED,
        title=f"Session failed: {reason}",
        body=reason[:500],
        payload={"session_id": str(session_id), "reason": reason},
        project_id=project_id,
    )
    db.add(n)
    await db.flush()
    return n


async def notify_budget_warning(
    db: AsyncSession,
    project_id: uuid.UUID,
    recipient: str,
    scope: str,
    used: float,
    cap: float,
) -> Notification:
    n = Notification(
        recipient=recipient,
        type=NotificationType.BUDGET_WARNING,
        title=f"Budget warning: {scope}",
        body=f"used ${used:.2f} of ${cap:.2f} cap",
        payload={"scope": scope, "used": used, "cap": cap},
        project_id=project_id,
    )
    db.add(n)
    await db.flush()
    return n


async def notify_review_requested(
    db: AsyncSession,
    project_id: uuid.UUID,
    recipient: str,
    issue_id: uuid.UUID,
    context: str = "",
) -> Notification:
    n = Notification(
        recipient=recipient,
        type=NotificationType.REVIEW_REQUESTED,
        title="Review requested",
        body=context[:500],
        payload={"issue_id": str(issue_id)},
        project_id=project_id,
    )
    db.add(n)
    await db.flush()
    return n
