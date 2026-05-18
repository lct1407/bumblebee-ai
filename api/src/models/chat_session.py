"""ChatSession: Tier 2 conversational interface (forge-adopted)."""
import uuid
from sqlalchemy import String, ForeignKey, Enum as SqlEnum

_evcall = lambda x: [e.value for e in x]
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from src.models.base import Base, UUIDPKMixin, TimestampMixin


class ChatSource(str, enum.Enum):
    WEB = "web"
    CLI = "cli"
    API = "api"


class ChatSession(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "chat_sessions"

    title: Mapped[str | None] = mapped_column(String(500))
    messages: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    source: Mapped[ChatSource] = mapped_column(
        SqlEnum(ChatSource, name="chat_source", values_callable=_evcall),
        default=ChatSource.WEB,
    )
    chat_metadata: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str | None] = mapped_column(String(200))

    project = relationship("Project", back_populates="chat_sessions")
