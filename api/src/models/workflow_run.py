"""WorkflowRun: live LangGraph execution instance against an issue."""
import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Enum as SqlEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from src.models.base import Base, UUIDPKMixin, TimestampMixin


class RunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class WorkflowRun(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "workflow_runs"

    status: Mapped[RunStatus] = mapped_column(
        SqlEnum(RunStatus, name="run_status"), default=RunStatus.PENDING, index=True
    )
    current_node: Mapped[str | None] = mapped_column(String(100))
    state_snapshot: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    langgraph_thread_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    # ^ Thread ID for LangGraph PostgresSaver checkpointer

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True
    )

    workflow = relationship("Workflow", back_populates="runs")
    sessions = relationship("AgentSession", back_populates="workflow_run")
