"""Issue relations + per-type custom field schemas.

Adds:
  - issues.custom_fields (JSONB, default {})
  - issue_relations (source, target, kind ∈ blocks/depends_on/duplicates/caused_by/relates_to)
  - field_schemas (workspace, project, issue_type → JSON schema for custom fields)

Revision ID: 20260525_0004
Revises: 20260525_0003
"""
from __future__ import annotations
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "20260525_0004"
down_revision = "20260525_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. issues.custom_fields
    op.add_column(
        "issues",
        sa.Column("custom_fields", JSONB, nullable=False, server_default="{}"),
    )

    # 2. issue_relations
    op.create_table(
        "issue_relations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True),
                  sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("source_issue_id", UUID(as_uuid=True),
                  sa.ForeignKey("issues.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("target_issue_id", UUID(as_uuid=True),
                  sa.ForeignKey("issues.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("kind", sa.Enum(
            "blocks", "depends_on", "duplicates", "caused_by", "relates_to",
            name="issue_relation_kind",
        ), nullable=False, index=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_by_user_id", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
        sa.UniqueConstraint("source_issue_id", "target_issue_id", "kind",
                            name="uq_issue_relation_triple"),
    )

    # 3. field_schemas (per workspace/project/issue_type) — raw SQL avoids
    # Alembic re-creating the already-existing issue_type enum.
    op.execute("""
        CREATE TABLE field_schemas (
          id UUID PRIMARY KEY,
          workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
          issue_type issue_type NOT NULL,
          schema JSONB NOT NULL DEFAULT '{}'::jsonb,
          description VARCHAR(500),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_field_schema_per_type UNIQUE (workspace_id, project_id, issue_type)
        )
    """)
    op.execute("CREATE INDEX ix_field_schemas_workspace ON field_schemas(workspace_id)")
    op.execute("CREATE INDEX ix_field_schemas_project ON field_schemas(project_id)")
    op.execute("CREATE INDEX ix_field_schemas_type ON field_schemas(issue_type)")


def downgrade() -> None:
    op.drop_table("field_schemas")
    op.drop_table("issue_relations")
    op.execute("DROP TYPE IF EXISTS issue_relation_kind")
    op.drop_column("issues", "custom_fields")
