"""Add OAuth identity columns to users table.

Supports Google + future providers (GitHub, Microsoft). User can have either
local password OR OAuth identity (or both).

Revision ID: 20260522_0001
Revises: 20260525_0001
Create Date: 2026-05-22 06:30:00
"""
from __future__ import annotations
import sqlalchemy as sa
from alembic import op

revision = "20260522_0001"
down_revision = "20260525_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("oauth_provider", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("oauth_sub", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(500), nullable=True))
    # Local password is optional once OAuth is in play
    op.alter_column("users", "password_hash", nullable=True)
    op.create_index(
        "ix_users_oauth_provider_sub",
        "users",
        ["oauth_provider", "oauth_sub"],
        unique=True,
        postgresql_where=sa.text("oauth_provider IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_users_oauth_provider_sub", table_name="users")
    op.alter_column("users", "password_hash", nullable=False)
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "oauth_sub")
    op.drop_column("users", "oauth_provider")
