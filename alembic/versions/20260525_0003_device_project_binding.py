"""Device ↔ Project binding — BB-16.

Adds:
- agent_nodes.bound_project_ids (JSONB, default [])
- task_queue.required_project_id (UUID, nullable, indexed)

Revision ID: 20260525_0003
Revises: 20260525_0002
"""
from __future__ import annotations
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "20260525_0003"
down_revision = "20260525_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent_nodes",
        sa.Column(
            "bound_project_ids", JSONB, nullable=False, server_default="[]",
        ),
    )
    # task_queue table is created at runtime via raw SQL? Check first
    bind = op.get_bind()
    has_tq = bind.execute(sa.text(
        "SELECT to_regclass('public.task_queue') IS NOT NULL"
    )).scalar()
    if has_tq:
        op.add_column(
            "task_queue",
            sa.Column("required_project_id", UUID(as_uuid=True), nullable=True),
        )
        op.create_index(
            "ix_task_queue_required_project",
            "task_queue", ["required_project_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    has_tq = bind.execute(sa.text(
        "SELECT to_regclass('public.task_queue') IS NOT NULL"
    )).scalar()
    if has_tq:
        op.drop_index("ix_task_queue_required_project", table_name="task_queue")
        op.drop_column("task_queue", "required_project_id")
    op.drop_column("agent_nodes", "bound_project_ids")
