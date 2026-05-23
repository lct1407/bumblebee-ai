"""KnowledgeEntry: project memory (forge-adopted useCount + lastUsedAt)."""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime, Enum as SqlEnum

_evcall = lambda x: [e.value for e in x]
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from bumblebee.models.base import Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin


class KnowledgeCategory(str, enum.Enum):
    DECISION = "decision"
    CONVENTION = "convention"
    PITFALL = "pitfall"
    FACT = "fact"


class KnowledgeEntry(Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin):
    __tablename__ = "knowledge_entries"

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[KnowledgeCategory] = mapped_column(
        SqlEnum(KnowledgeCategory, name="knowledge_category", values_callable=_evcall),
        nullable=False, index=True,
    )
    tags: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    scope_globs: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    # ^ where this knowledge applies (file path patterns)

    # Usage tracking (forge-adopted)
    use_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Supersede chain
    supersedes_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_entries.id", ondelete="SET NULL")
    )

    contributed_by_session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    project = relationship("Project", back_populates="knowledge_entries")
