"""Notification: first-class entity (forge-adopted)."""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, DateTime, Boolean, Enum as SqlEnum

_evcall = lambda x: [e.value for e in x]
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from bumblebee.models.base import Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin


class NotificationType(str, enum.Enum):
    SESSION_COMPLETED = "session_completed"
    SESSION_FAILED = "session_failed"
    BUDGET_WARNING = "budget_warning"
    EVAL_FAILED = "eval_failed"
    REVIEW_REQUESTED = "review_requested"
    MENTION = "mention"
    PLAN_READY = "plan_ready"
    ISSUE_BLOCKED = "issue_blocked"


class Notification(Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin):
    __tablename__ = "notifications"

    recipient: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    type: Mapped[NotificationType] = mapped_column(
        SqlEnum(NotificationType, name="notification_type", values_callable=_evcall),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    project = relationship("Project", back_populates="notifications")
