"""AgentSession: one specialist agent doing one phase. Bounded; chained for hours-long issues."""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, Float, ForeignKey, DateTime, Enum as SqlEnum

_evcall = lambda x: [e.value for e in x]
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from src.models.base import Base, UUIDPKMixin, TimestampMixin


class SessionStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"  # checkpointed; awaiting continuation
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class FailureReason(str, enum.Enum):
    HALLUCINATION = "hallucination"
    TOOL_ERROR = "tool_error"
    CONTEXT_EXHAUST = "context_exhaust"
    GOAL_DRIFT = "goal_drift"
    INFRA = "infra"
    PLANNING_BRITTLENESS = "planning_brittleness"
    TIMEOUT = "timeout"
    BUDGET_EXCEEDED = "budget_exceeded"
    INFINITE_LOOP = "infinite_loop"
    UNKNOWN = "unknown"


class AgentSession(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "agent_sessions"

    status: Mapped[SessionStatus] = mapped_column(
        SqlEnum(SessionStatus, name="session_status", values_callable=_evcall),
        default=SessionStatus.PENDING, index=True,
    )
    role: Mapped[str] = mapped_column(String(100), nullable=False)  # mirrors AgentDefinition.role
    phase: Mapped[str | None] = mapped_column(String(100))  # workflow node id
    provider: Mapped[str] = mapped_column(String(50), default="claude-cli", nullable=False)
    model: Mapped[str | None] = mapped_column(String(100))
    prompt_hash: Mapped[str | None] = mapped_column(String(64))

    # Workspace
    workspace_branch: Mapped[str | None] = mapped_column(String(200))
    workspace_path: Mapped[str | None] = mapped_column(Text)

    # Budgets (snapshot from policy/agent_definition at start)
    budget_wall_min: Mapped[int | None] = mapped_column(Integer)
    budget_tokens_max: Mapped[int | None] = mapped_column(Integer)
    budget_dollars_max: Mapped[float | None] = mapped_column(Float)

    # Usage running totals
    tokens_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dollars_used: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Failure handling
    failure_reason: Mapped[FailureReason | None] = mapped_column(
        SqlEnum(FailureReason, name="failure_reason", values_callable=_evcall)
    )
    failure_detail: Mapped[str | None] = mapped_column(Text)

    # Memory tiers (see plan §4.6)
    scratch: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)  # Tier 3
    checkpoint_id: Mapped[str | None] = mapped_column(String(100))  # Tier 4 — LangGraph checkpoint ref
    continues_from_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_sessions.id", ondelete="SET NULL")
    )

    # Foreign keys
    issue_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), index=True
    )
    workflow_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_runs.id", ondelete="SET NULL"), index=True
    )
    agent_definition_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_definitions.id", ondelete="SET NULL")
    )
    chat_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="SET NULL")
    )

    issue = relationship("Issue", back_populates="agent_sessions")
    workflow_run = relationship("WorkflowRun", back_populates="sessions")
    agent_definition = relationship("AgentDefinition")
    scope_lease = relationship("ScopeLease", back_populates="session", uselist=False)
