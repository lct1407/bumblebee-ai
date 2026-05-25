"""Workflow: declarative graph definition (loaded into LangGraph StateGraph)."""
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import Base, TimestampMixin, UUIDPKMixin, WorkspaceScopedMixin


class Workflow(Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin):
    __tablename__ = "workflows"

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    graph: Mapped[dict] = mapped_column(JSONB, nullable=False)  # nodes, edges, conditions
    graph_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 of graph
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    source_plugin: Mapped[str | None] = mapped_column(String(200))

    project = relationship("Project", back_populates="workflows")
    runs = relationship("WorkflowRun", back_populates="workflow")
