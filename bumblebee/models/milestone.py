"""Milestone: a time-boxed grouping of issues for project progress planning.

A milestone (sprint / cycle / release) bundles issues under a name with optional
start/due dates and a status. Progress is computed at query time from the status
distribution of its issues.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import (
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPKMixin,
    WorkspaceScopedMixin,
)


def _evcall(x):
    return [e.value for e in x]


class MilestoneStatus(enum.StrEnum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Milestone(Base, UUIDPKMixin, TimestampMixin, SoftDeleteMixin, WorkspaceScopedMixin):
    __tablename__ = "milestones"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[MilestoneStatus] = mapped_column(
        SqlEnum(MilestoneStatus, name="milestone_status", values_callable=_evcall),
        default=MilestoneStatus.PLANNED,
        nullable=False,
        index=True,
    )
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    project = relationship("Project")
    issues = relationship("Issue", back_populates="milestone")
