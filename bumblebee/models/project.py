"""Project: shared workspace with backlog, workflows, knowledge, policy."""
from sqlalchemy import String, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import Base, UUIDPKMixin, TimestampMixin, SoftDeleteMixin


class Project(Base, UUIDPKMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    key: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)  # e.g., "BB"
    description: Mapped[str | None] = mapped_column(Text)
    repo_path: Mapped[str | None] = mapped_column(Text)  # monorepo path
    base_branch: Mapped[str] = mapped_column(String(100), default="main", nullable=False)

    # PolicyConfig (budget ceilings, concurrency limits, eval gates)
    policy_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Deploy integration (forge-style baked in)
    deploy_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    observability_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    issues = relationship("Issue", back_populates="project", cascade="all, delete-orphan")
    agent_definitions = relationship("AgentDefinition", back_populates="project")
    skills = relationship("Skill", back_populates="project")
    workflows = relationship("Workflow", back_populates="project")
    knowledge_entries = relationship("KnowledgeEntry", back_populates="project")
    chat_sessions = relationship("ChatSession", back_populates="project")
    notifications = relationship("Notification", back_populates="project")
