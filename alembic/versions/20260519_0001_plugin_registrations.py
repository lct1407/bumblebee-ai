"""plugin_registrations table — Phase 3 plugin support.

Revision ID: 20260519_0001
Revises: 20260518_0001
Create Date: 2026-05-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260519_0001"
down_revision: Union[str, None] = "20260518_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plugin_registrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
        sa.Column("version", sa.String(50)),
        sa.Column("module", sa.String(500)),
        sa.Column("status", sa.String(50), nullable=False, server_default="loaded"),
        sa.Column("manifest", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("error_message", sa.Text),
        sa.Column("loaded_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_plugin_registrations_name", "plugin_registrations", ["name"])

    # source_plugin column on plugin-contributed tables
    for tbl in ["workflows", "agent_definitions", "skills"]:
        op.add_column(tbl, sa.Column("source_plugin", sa.String(200), nullable=True))


def downgrade() -> None:
    for tbl in ["workflows", "agent_definitions", "skills"]:
        op.drop_column(tbl, "source_plugin")
    op.drop_index("ix_plugin_registrations_name", "plugin_registrations")
    op.drop_table("plugin_registrations")
