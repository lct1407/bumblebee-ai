"""Workspace tenancy — Phase A of commercial SaaS upgrade.

Adds:
- workspaces (with owner, plan, stripe linkage columns, spend counter, payment-overdue grace)
- workspace_members (user × workspace × role join)
- workspace_invites (single-use email invites with TTL)
- workspace_id FK on every tenant-scoped table

Data migration: creates a "Default" workspace owned by the first user (alphabetical by
created_at) and back-fills every existing row to that workspace_id. Reversible.

Revision ID: 20260525_0001
Revises: 20260521_0001
Create Date: 2026-05-25 00:01:00
"""
from __future__ import annotations
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "20260525_0001"
down_revision = "20260521_0001"
branch_labels = None
depends_on = None

# Tables that get a workspace_id FK. The order matters (data migration walks this list).
TENANT_SCOPED_TABLES = [
    "projects",
    "issues",
    "events",
    "agent_sessions",
    "workflows",
    "workflow_runs",
    "knowledge_entries",
    "chat_sessions",
    "notifications",
    "api_keys",
    "scope_leases",
    "comments",
    "agent_definitions",
    "skills",
]


def upgrade() -> None:
    # Defensively drop any residual enum types from prior failed runs.
    # (asyncpg+alembic doesn't honour Enum.create(checkfirst=True) reliably.)
    op.execute("DROP TYPE IF EXISTS workspacerole CASCADE")
    op.execute("DROP TYPE IF EXISTS workspaceplan CASCADE")
    bind = op.get_bind()

    # First column reference owns the CREATE TYPE; subsequent references
    # set create_type=False to avoid duplicates.
    workspace_role = sa.Enum(
        "owner", "admin", "member", "viewer", name="workspacerole"
    )
    workspace_role_reuse = sa.Enum(
        "owner", "admin", "member", "viewer", name="workspacerole", create_type=False
    )
    workspace_plan = sa.Enum("free", "pro", "team", name="workspaceplan")

    # 2) workspaces table
    op.create_table(
        "workspaces",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "plan", workspace_plan, server_default="free", nullable=False
        ),
        sa.Column("stripe_customer_id", sa.String(64), nullable=True, index=True),
        sa.Column("stripe_subscription_id", sa.String(64), nullable=True, index=True),
        sa.Column(
            "llm_spend_cents_this_period", sa.Integer, server_default="0", nullable=False
        ),
        sa.Column("period_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "payment_overdue", sa.Boolean, server_default="false", nullable=False
        ),
        sa.Column("payment_overdue_since", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settings", JSONB, server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 3) workspace_members
    op.create_table(
        "workspace_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("role", workspace_role_reuse, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )

    # 4) workspace_invites
    op.create_table(
        "workspace_invites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("email", sa.String(255), nullable=False, index=True),
        sa.Column("role", workspace_role_reuse, nullable=False),
        sa.Column("token", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "invited_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # 5) Add workspace_id FK to every tenant-scoped table (nullable initially for backfill)
    for table in TENANT_SCOPED_TABLES:
        op.add_column(
            table,
            sa.Column(
                "workspace_id",
                UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )
        op.create_index(
            f"ix_{table}_workspace_id", table, ["workspace_id"]
        )

    # 6) DATA MIGRATION: backfill into a default workspace owned by first user
    first_user = bind.execute(
        sa.text("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
    ).fetchone()
    if first_user:
        ws_id = uuid.uuid4()
        now = sa.text("now()")
        bind.execute(
            sa.text(
                """
                INSERT INTO workspaces
                  (id, name, slug, owner_user_id, plan,
                   llm_spend_cents_this_period, payment_overdue, settings,
                   created_at, updated_at)
                VALUES (:id, 'Default', 'default', :owner, 'free', 0, false, '{}'::jsonb, now(), now())
                """
            ),
            {"id": ws_id, "owner": first_user[0]},
        )
        # First user becomes owner
        bind.execute(
            sa.text(
                """
                INSERT INTO workspace_members
                  (id, workspace_id, user_id, role, created_at, updated_at)
                VALUES (:id, :ws, :user, 'owner', now(), now())
                """
            ),
            {"id": uuid.uuid4(), "ws": ws_id, "user": first_user[0]},
        )
        # All other users become members of the default workspace
        bind.execute(
            sa.text(
                """
                INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at, updated_at)
                SELECT gen_random_uuid(), :ws, id, 'member', now(), now()
                FROM users
                WHERE id <> :owner
                """
            ),
            {"ws": ws_id, "owner": first_user[0]},
        )
        # Backfill every tenant-scoped row to the default workspace
        for table in TENANT_SCOPED_TABLES:
            bind.execute(
                sa.text(f"UPDATE {table} SET workspace_id = :ws WHERE workspace_id IS NULL"),
                {"ws": ws_id},
            )

    # 7) NOT NULL the workspace_id on every scoped table (except api_keys which can be
    #    workspace-less for system-level keys)
    for table in TENANT_SCOPED_TABLES:
        if table == "api_keys":
            continue  # API keys may be system-scoped (no workspace)
        op.alter_column(table, "workspace_id", nullable=False)


def downgrade() -> None:
    # Drop workspace_id from all scoped tables
    for table in TENANT_SCOPED_TABLES:
        op.drop_index(f"ix_{table}_workspace_id", table_name=table)
        op.drop_column(table, "workspace_id")

    op.drop_table("workspace_invites")
    op.drop_table("workspace_members")
    op.drop_table("workspaces")

    sa.Enum(name="workspacerole").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="workspaceplan").drop(op.get_bind(), checkfirst=True)
