"""users + api_keys — v0.4.0 commercial auth

Revision ID: 20260521_0001
Revises: 20260519_0001
Create Date: 2026-05-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260521_0001"
down_revision: Union[str, None] = "20260519_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_admin", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("user_id", sa.String(200)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("scopes", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"])


def downgrade() -> None:
    op.drop_index("ix_api_keys_key_hash", "api_keys")
    op.drop_table("api_keys")
    op.drop_index("ix_users_username", "users")
    op.drop_index("ix_users_email", "users")
    op.drop_table("users")
