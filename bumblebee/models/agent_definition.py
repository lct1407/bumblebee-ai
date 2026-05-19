"""AgentDefinition: template defining a role (forge-adopted)."""
import uuid
from sqlalchemy import String, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import Base, UUIDPKMixin, TimestampMixin


class AgentDefinition(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "agent_definitions"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # ^ e.g., "triager" | "coordinator" | "implementer" | "tester" | "reviewer" | "assistant"
    description: Mapped[str | None] = mapped_column(Text)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 of template

    default_tools: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)  # tool names
    skill_refs: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)  # skill ids
    focus_areas: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    custom_instructions: Mapped[str | None] = mapped_column(Text)

    # Defaults override-able per-session
    default_budgets: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # ^ {wall_min, tokens_max, dollars_max}

    is_global: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    source_plugin: Mapped[str | None] = mapped_column(String(200))

    project = relationship("Project", back_populates="agent_definitions")
