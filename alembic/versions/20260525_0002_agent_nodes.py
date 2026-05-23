"""agent_nodes table — Phase G device pairing.

Each row is a registered worker machine that pulls tasks via /api/tasks/claim.
Workspace-scoped: a node belongs to one workspace.

Revision ID: 20260525_0002
Revises: 20260522_0001
Create Date: 2026-05-23 00:00:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "20260525_0002"
down_revision = "20260522_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_nodes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "active", "revoked", name="node_status"),
            nullable=False, server_default="pending",
        ),
        sa.Column("pairing_code", sa.String(16), nullable=True, index=True),
        sa.Column("token_hash", sa.String(255), nullable=True, unique=True, index=True),
        sa.Column("capabilities", JSONB, nullable=False, server_default="[]"),
        sa.Column("platform", sa.String(50)),
        sa.Column("hostname", sa.String(255)),
        sa.Column("ip_last_seen", sa.String(64)),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), index=True),
        sa.Column("created_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("settings", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("agent_nodes")
    op.execute("DROP TYPE IF EXISTS node_status")
