"""Issue: unit of intent (replaces v2 WorkItem). Hierarchical via parent_id."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SqlEnum


def _evcall(x):
    return [e.value for e in x]  # serialize enum by value not name
import enum

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import (
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPKMixin,
    WorkspaceScopedMixin,
)


class IssueType(enum.StrEnum):
    EPIC = "epic"
    STORY = "story"
    TASK = "task"
    BUG = "bug"
    FEATURE = "feature"
    CHORE = "chore"
    SPIKE = "spike"


class IssueStatus(enum.StrEnum):
    NEW = "new"
    TRIAGED = "triaged"
    PLANNED = "planned"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DEVELOPED = "developed"
    DEPLOYING = "deploying"
    TESTING = "testing"
    STAGING = "staging"
    RELEASED = "released"
    CLOSED = "closed"
    FAILED = "failed"
    REOPEN = "reopen"
    WONT_FIX = "wont_fix"
    NEEDS_INFO = "needs_info"
    BLOCKED = "blocked"
    ON_HOLD = "on_hold"


class IssuePriority(enum.StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


class IssueComplexity(enum.StrEnum):
    SIMPLE = "simple"
    MEDIUM = "medium"
    COMPLEX = "complex"


class Issue(Base, UUIDPKMixin, TimestampMixin, SoftDeleteMixin, WorkspaceScopedMixin):
    __tablename__ = "issues"

    number: Mapped[int] = mapped_column(Integer, nullable=False)  # per-project numbering
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[IssueType] = mapped_column(
        SqlEnum(IssueType, name="issue_type", values_callable=_evcall), default=IssueType.TASK
    )
    status: Mapped[IssueStatus] = mapped_column(
        SqlEnum(IssueStatus, name="issue_status", values_callable=_evcall),
        default=IssueStatus.NEW, index=True,
    )
    priority: Mapped[IssuePriority] = mapped_column(
        SqlEnum(IssuePriority, name="issue_priority", values_callable=_evcall),
        default=IssuePriority.NONE,
    )
    complexity: Mapped[IssueComplexity | None] = mapped_column(
        SqlEnum(IssueComplexity, name="issue_complexity", values_callable=_evcall)
    )

    # AI fields (Triager populates)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_suggested_solution: Mapped[str | None] = mapped_column(Text)
    ai_acceptance_criteria: Mapped[dict | None] = mapped_column(JSONB)
    ai_confidence: Mapped[float | None] = mapped_column(Float)  # 0-1; low â†’ human review

    acceptance_criteria: Mapped[str | None] = mapped_column(Text)
    scope_hints: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)  # file globs

    # Hierarchy
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issues.id", ondelete="SET NULL"), index=True
    )

    # Work attribution + scheduling (team collaboration + progress tracking)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("milestones.id", ondelete="SET NULL"), index=True
    )
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estimate: Mapped[int | None] = mapped_column(Integer)  # story points

    # Cached session context (legacy â€” primary memory in event log + IssueMemory projection)
    session_context: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Per-type custom field values (validated against field_schemas row for this type)
    custom_fields: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="issues")
    parent = relationship("Issue", remote_side="Issue.id", back_populates="children")
    children = relationship("Issue", back_populates="parent")
    assignee = relationship("User", foreign_keys=[assignee_id])
    reporter = relationship("User", foreign_keys=[reporter_id])
    milestone = relationship("Milestone", back_populates="issues")
    comments = relationship("Comment", back_populates="issue", cascade="all, delete-orphan")
    agent_sessions = relationship("AgentSession", back_populates="issue")
    scope_leases = relationship("ScopeLease", back_populates="issue")
