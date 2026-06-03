"""Collaboration + progress tracking.

Adds:
  - milestones (workspace, project, name, status, start/due dates) — time-boxed
    grouping of issues for project progress planning.
  - issues.assignee_id / reporter_id (FK users) — work attribution.
  - issues.milestone_id (FK milestones) — issue → milestone grouping.
  - issues.start_date / due_date (timestamptz) — scheduling.
  - issues.estimate (int) — story points.
  - comments.author_user_id (FK users) — comment attribution.
  - notification_type enum gains 'assigned'.

Revision ID: 20260602_0001
Revises: 20260525_0004
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260602_0001"
down_revision = "20260525_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. milestones
    op.create_table(
        "milestones",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True),
                  sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("project_id", UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.Enum(
            "planned", "active", "completed", "cancelled",
            name="milestone_status",
        ), nullable=False, server_default="planned", index=True),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
    )

    # 2. issues: assignment + scheduling
    op.add_column("issues", sa.Column("assignee_id", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("issues", sa.Column("reporter_id", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("issues", sa.Column("milestone_id", UUID(as_uuid=True),
                  sa.ForeignKey("milestones.id", ondelete="SET NULL"), nullable=True))
    op.add_column("issues", sa.Column("start_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("issues", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("issues", sa.Column("estimate", sa.Integer(), nullable=True))
    op.create_index("ix_issues_assignee_id", "issues", ["assignee_id"])
    op.create_index("ix_issues_milestone_id", "issues", ["milestone_id"])

    # 3. comments: attribution
    op.add_column("comments", sa.Column("author_user_id", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))

    # 4. notification_type enum += 'assigned'
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assigned'")


def downgrade() -> None:
    op.drop_column("comments", "author_user_id")
    op.drop_index("ix_issues_milestone_id", table_name="issues")
    op.drop_index("ix_issues_assignee_id", table_name="issues")
    op.drop_column("issues", "estimate")
    op.drop_column("issues", "due_date")
    op.drop_column("issues", "start_date")
    op.drop_column("issues", "milestone_id")
    op.drop_column("issues", "reporter_id")
    op.drop_column("issues", "assignee_id")
    op.drop_table("milestones")
    op.execute("DROP TYPE IF EXISTS milestone_status")
    # notification_type 'assigned' value is left in place (Postgres can't easily drop enum values)
