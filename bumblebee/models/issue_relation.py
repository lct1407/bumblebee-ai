"""Issue ↔ Issue relations (blocks / depends_on / relates_to / duplicates / caused_by).

Hierarchy (Epic → Story → Task) lives in Issue.parent_id. This table covers
non-hierarchical links that planners and reviewers need.

Kinds (with inverse mapping):
  blocks         ↔ blocked_by
  depends_on     ↔ is_depended_on_by
  duplicates     ↔ duplicated_by
  caused_by      ↔ causes
  relates_to     (symmetric — no inverse stored)

Convention: store the source-side kind. The inverse is derived at query time.
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import Base, TimestampMixin, UUIDPKMixin, WorkspaceScopedMixin


class IssueRelationKind(enum.StrEnum):
    BLOCKS = "blocks"
    DEPENDS_ON = "depends_on"
    DUPLICATES = "duplicates"
    CAUSED_BY = "caused_by"
    RELATES_TO = "relates_to"


# Map kind → its inverse label (None = symmetric)
INVERSE_OF: dict[IssueRelationKind, str] = {
    IssueRelationKind.BLOCKS: "blocked_by",
    IssueRelationKind.DEPENDS_ON: "is_depended_on_by",
    IssueRelationKind.DUPLICATES: "duplicated_by",
    IssueRelationKind.CAUSED_BY: "causes",
    IssueRelationKind.RELATES_TO: "relates_to",
}


class IssueRelation(Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin):
    __tablename__ = "issue_relations"
    __table_args__ = (
        UniqueConstraint(
            "source_issue_id", "target_issue_id", "kind",
            name="uq_issue_relation_triple",
        ),
    )

    source_issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("issues.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    target_issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("issues.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    kind: Mapped[IssueRelationKind] = mapped_column(
        SqlEnum(IssueRelationKind, name="issue_relation_kind",
                values_callable=lambda x: [e.value for e in x]),
        nullable=False, index=True,
    )

    note: Mapped[str | None] = mapped_column(String(500))
    """Optional human note: 'caused by 401 leak in v0.4.2 deploy', etc."""

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    source = relationship("Issue", foreign_keys=[source_issue_id])
    target = relationship("Issue", foreign_keys=[target_issue_id])
