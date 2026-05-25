"""Comment on an issue."""
import uuid

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, String, Text


def _evcall(x):
    return [e.value for e in x]
import enum

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import Base, TimestampMixin, UUIDPKMixin, WorkspaceScopedMixin


class CommentType(enum.StrEnum):
    DISCUSSION = "discussion"
    PROPOSAL = "proposal"
    PLAN = "plan"
    EXECUTION = "execution"
    REVIEW = "review"
    SYSTEM = "system"


class Comment(Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin):
    __tablename__ = "comments"

    body: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[CommentType] = mapped_column(
        SqlEnum(CommentType, name="comment_type", values_callable=_evcall),
        default=CommentType.DISCUSSION,
    )
    author: Mapped[str | None] = mapped_column(String(200))

    issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True
    )

    issue = relationship("Issue", back_populates="comments")
