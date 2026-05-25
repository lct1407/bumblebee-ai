"""ChatSession: Tier 2 conversational interface (forge-adopted)."""
import uuid

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, String


def _evcall(x):
    return [e.value for e in x]
import enum

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import Base, TimestampMixin, UUIDPKMixin, WorkspaceScopedMixin


class ChatSource(enum.StrEnum):
    WEB = "web"
    CLI = "cli"
    API = "api"


class ChatSession(Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin):
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
