"""Comment on an issue."""
import uuid
from sqlalchemy import String, Text, ForeignKey, Enum as SqlEnum

_evcall = lambda x: [e.value for e in x]
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from src.models.base import Base, UUIDPKMixin, TimestampMixin


class CommentType(str, enum.Enum):
    DISCUSSION = "discussion"
    PROPOSAL = "proposal"
    PLAN = "plan"
    EXECUTION = "execution"
    REVIEW = "review"
    SYSTEM = "system"


class Comment(Base, UUIDPKMixin, TimestampMixin):
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
