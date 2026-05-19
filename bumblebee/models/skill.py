"""Skill: capability bundle (forge-adopted). Referenced by AgentDefinitions."""
import uuid
from sqlalchemy import String, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import Base, UUIDPKMixin, TimestampMixin


class Skill(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "skills"

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[str] = mapped_column(String(20), default="1.0.0", nullable=False)
    skill_md: Mapped[str] = mapped_column(Text, nullable=False)  # full markdown content
    files: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)  # file refs
    is_global: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    source_plugin: Mapped[str | None] = mapped_column(String(200))

    project = relationship("Project", back_populates="skills")
