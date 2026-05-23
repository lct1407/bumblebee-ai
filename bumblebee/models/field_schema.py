"""Per-(workspace, project, issue_type) custom field schemas.

Lets ops define what extra fields a Bug needs (severity, repro steps) vs.
what a Story needs (story_points, persona) vs. Epic (target_release, OKR).

Stored as a small JSON Schema per row; UI renders form dynamically.
Issue.custom_fields holds the values.
"""
from __future__ import annotations
import uuid

from sqlalchemy import ForeignKey, String, Enum as SqlEnum, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from bumblebee.models.base import Base, TimestampMixin, UUIDPKMixin, WorkspaceScopedMixin
from bumblebee.models.issue import IssueType


class FieldSchema(Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin):
    __tablename__ = "field_schemas"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "issue_type",
            name="uq_field_schema_per_type",
        ),
    )

    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    """NULL = applies to all projects in the workspace; else project-specific."""

    issue_type: Mapped[IssueType] = mapped_column(
        SqlEnum(IssueType, name="issue_type",
                values_callable=lambda x: [e.value for e in x], create_type=False),
        nullable=False, index=True,
    )

    schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    """JSON Schema (draft-07 subset). Example:

      {
        "fields": [
          {"key": "severity", "type": "enum", "options": ["low","med","high","crit"], "required": true},
          {"key": "repro_steps", "type": "text", "max_length": 2000},
          {"key": "affected_version", "type": "string", "pattern": "^v\\\\d+\\\\.\\\\d+"}
        ]
      }
    """

    description: Mapped[str | None] = mapped_column(String(500))
