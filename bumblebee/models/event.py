"""Event: append-only canonical record. Sole source of truth in v3."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from bumblebee.models.base import Base, UUIDPKMixin, WorkspaceScopedMixin, utcnow


class EventType(enum.StrEnum):
    # Workflow lifecycle
    WORKFLOW_STARTED = "workflow_started"
    WORKFLOW_COMPLETED = "workflow_completed"
    WORKFLOW_FAILED = "workflow_failed"
    WORKFLOW_PAUSED = "workflow_paused"

    # Status transitions
    STATUS_CHANGE = "status_change"
    DECISION_TAKEN = "decision_taken"

    # Session
    SESSION_STARTED = "session_started"
    SESSION_COMPLETED = "session_completed"
    SESSION_FAILED = "session_failed"
    SESSION_CHECKPOINTED = "session_checkpointed"

    # LLM
    LLM_CALL = "llm_call"

    # Tools
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"

    # Lease
    LEASE_ACQUIRED = "lease_acquired"
    LEASE_RELEASED = "lease_released"
    LEASE_REVOKED = "lease_revoked"

    # Knowledge
    KNOWLEDGE_ADDED = "knowledge_added"
    KNOWLEDGE_USED = "knowledge_used"

    # Cost
    COST_CHARGED = "cost_charged"
    BUDGET_WARNING = "budget_warning"
    BUDGET_EXCEEDED = "budget_exceeded"

    # Safety
    LOOP_DETECTED = "loop_detected"
    KILL_REQUESTED = "kill_requested"

    # Chat
    CHAT_MESSAGE = "chat_message"
    CHAT_SUGGESTION = "chat_suggestion"

    # Subtask coordination
    SUBTASK_COMPLETE = "subtask_complete"
    PLAN_COMPLETE = "plan_complete"


class Event(Base, UUIDPKMixin, WorkspaceScopedMixin):
    """Append-only. NEVER updated."""
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_issue_occurred", "issue_id", "occurred_at"),
        Index("ix_events_session_occurred", "session_id", "occurred_at"),
        Index("ix_events_type_occurred", "type", "occurred_at"),
    )

    type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Source context
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    issue_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    chat_session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    workflow_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)

    # Causality DAG
    causation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="SET NULL")
    )

    # Provenance
    source: Mapped[str] = mapped_column(String(50), default="system", nullable=False)
    # ^ "system" | "agent" | "user" | "chat" | "webhook"
    actor: Mapped[str | None] = mapped_column(String(200))

    # Prompt versioning (when type=llm_call)
    prompt_hash: Mapped[str | None] = mapped_column(String(64))

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
