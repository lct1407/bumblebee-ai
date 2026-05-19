"""initial schema — all 14 entities for v3.0

Revision ID: 20260518_0001
Revises:
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260518_0001"
down_revision: Union[str, None] = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ENUMS
    op.execute("CREATE TYPE issue_type AS ENUM ('epic','story','task','bug','feature','chore','spike')")
    op.execute("""CREATE TYPE issue_status AS ENUM (
        'new','triaged','planned','approved','in_progress','in_review','developed',
        'deploying','testing','staging','released','closed','failed','reopen',
        'wont_fix','needs_info','blocked','on_hold')""")
    op.execute("CREATE TYPE issue_priority AS ENUM ('critical','high','medium','low','none')")
    op.execute("CREATE TYPE issue_complexity AS ENUM ('simple','medium','complex')")
    op.execute("CREATE TYPE comment_type AS ENUM ('discussion','proposal','plan','execution','review','system')")
    op.execute("CREATE TYPE session_status AS ENUM ('pending','running','paused','completed','failed','canceled')")
    op.execute("""CREATE TYPE failure_reason AS ENUM (
        'hallucination','tool_error','context_exhaust','goal_drift','infra',
        'planning_brittleness','timeout','budget_exceeded','infinite_loop','unknown')""")
    op.execute("CREATE TYPE run_status AS ENUM ('pending','running','paused','completed','failed','canceled')")
    op.execute("CREATE TYPE lease_status AS ENUM ('active','expired','released','revoked')")
    op.execute("CREATE TYPE chat_source AS ENUM ('web','cli','api')")
    op.execute("CREATE TYPE knowledge_category AS ENUM ('decision','convention','pitfall','fact')")
    op.execute("""CREATE TYPE notification_type AS ENUM (
        'session_completed','session_failed','budget_warning','eval_failed',
        'review_requested','mention','plan_ready','issue_blocked')""")

    # projects
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("key", sa.String(10), nullable=False, unique=True),
        sa.Column("description", sa.Text),
        sa.Column("repo_path", sa.Text),
        sa.Column("base_branch", sa.String(100), nullable=False, server_default="main"),
        sa.Column("policy_config", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("deploy_config", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("observability_config", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_projects_slug", "projects", ["slug"])

    # issues
    op.create_table(
        "issues",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("number", sa.Integer, nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("type", postgresql.ENUM(name="issue_type", create_type=False), nullable=False, server_default="task"),
        sa.Column("status", postgresql.ENUM(name="issue_status", create_type=False), nullable=False, server_default="new"),
        sa.Column("priority", postgresql.ENUM(name="issue_priority", create_type=False), nullable=False, server_default="none"),
        sa.Column("complexity", postgresql.ENUM(name="issue_complexity", create_type=False)),
        sa.Column("ai_summary", sa.Text),
        sa.Column("ai_suggested_solution", sa.Text),
        sa.Column("ai_acceptance_criteria", postgresql.JSONB),
        sa.Column("ai_confidence", sa.Float),
        sa.Column("acceptance_criteria", sa.Text),
        sa.Column("scope_hints", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("issues.id", ondelete="SET NULL")),
        sa.Column("session_context", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_issues_project_id", "issues", ["project_id"])
    op.create_index("ix_issues_parent_id", "issues", ["parent_id"])
    op.create_index("ix_issues_status", "issues", ["status"])
    op.create_unique_constraint("uq_issues_project_number", "issues", ["project_id", "number"])

    # comments
    op.create_table(
        "comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("type", postgresql.ENUM(name="comment_type", create_type=False), nullable=False, server_default="discussion"),
        sa.Column("author", sa.String(200)),
        sa.Column("issue_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_comments_issue_id", "comments", ["issue_id"])

    # agent_definitions
    op.create_table(
        "agent_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("role", sa.String(100), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("prompt_template", sa.Text, nullable=False),
        sa.Column("prompt_hash", sa.String(64), nullable=False),
        sa.Column("default_tools", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("skill_refs", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("focus_areas", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("custom_instructions", sa.Text),
        sa.Column("default_budgets", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("is_global", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_agent_definitions_role", "agent_definitions", ["role"])
    op.create_index("ix_agent_definitions_project", "agent_definitions", ["project_id"])

    # skills
    op.create_table(
        "skills",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("skill_md", sa.Text, nullable=False),
        sa.Column("files", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("is_global", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_skills_name", "skills", ["name"])

    # workflows
    op.create_table(
        "workflows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("graph", postgresql.JSONB, nullable=False),
        sa.Column("graph_hash", sa.String(64), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_workflows_name", "workflows", ["name"])

    # workflow_runs
    op.create_table(
        "workflow_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("status", postgresql.ENUM(name="run_status", create_type=False), nullable=False, server_default="pending"),
        sa.Column("current_node", sa.String(100)),
        sa.Column("state_snapshot", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("langgraph_thread_id", sa.String(100), unique=True),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issue_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_workflow_runs_status", "workflow_runs", ["status"])
    op.create_index("ix_workflow_runs_issue", "workflow_runs", ["issue_id"])

    # chat_sessions
    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500)),
        sa.Column("messages", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("source", postgresql.ENUM(name="chat_source", create_type=False), nullable=False, server_default="web"),
        sa.Column("chat_metadata", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_chat_sessions_project", "chat_sessions", ["project_id"])

    # agent_sessions
    op.create_table(
        "agent_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("status", postgresql.ENUM(name="session_status", create_type=False), nullable=False, server_default="pending"),
        sa.Column("role", sa.String(100), nullable=False),
        sa.Column("phase", sa.String(100)),
        sa.Column("provider", sa.String(50), nullable=False, server_default="claude-cli"),
        sa.Column("model", sa.String(100)),
        sa.Column("prompt_hash", sa.String(64)),
        sa.Column("workspace_branch", sa.String(200)),
        sa.Column("workspace_path", sa.Text),
        sa.Column("budget_wall_min", sa.Integer),
        sa.Column("budget_tokens_max", sa.Integer),
        sa.Column("budget_dollars_max", sa.Float),
        sa.Column("tokens_in", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer, nullable=False, server_default="0"),
        sa.Column("dollars_used", sa.Float, nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("failure_reason", postgresql.ENUM(name="failure_reason", create_type=False)),
        sa.Column("failure_detail", sa.Text),
        sa.Column("scratch", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("checkpoint_id", sa.String(100)),
        sa.Column("continues_from_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_sessions.id", ondelete="SET NULL")),
        sa.Column("issue_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("issues.id", ondelete="CASCADE")),
        sa.Column("workflow_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_runs.id", ondelete="SET NULL")),
        sa.Column("agent_definition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_definitions.id", ondelete="SET NULL")),
        sa.Column("chat_session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_agent_sessions_status", "agent_sessions", ["status"])
    op.create_index("ix_agent_sessions_issue", "agent_sessions", ["issue_id"])
    op.create_index("ix_agent_sessions_run", "agent_sessions", ["workflow_run_id"])

    # scope_leases
    op.create_table(
        "scope_leases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("status", postgresql.ENUM(name="lease_status", create_type=False), nullable=False, server_default="active"),
        sa.Column("patterns", postgresql.JSONB, nullable=False),
        sa.Column("resolved_files", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True)),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("issue_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_scope_leases_status", "scope_leases", ["status"])
    op.create_index("ix_scope_leases_issue", "scope_leases", ["issue_id"])

    # events (append-only)
    op.create_table(
        "events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True)),
        sa.Column("issue_id", postgresql.UUID(as_uuid=True)),
        sa.Column("session_id", postgresql.UUID(as_uuid=True)),
        sa.Column("chat_session_id", postgresql.UUID(as_uuid=True)),
        sa.Column("workflow_run_id", postgresql.UUID(as_uuid=True)),
        sa.Column("causation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="SET NULL")),
        sa.Column("source", sa.String(50), nullable=False, server_default="system"),
        sa.Column("actor", sa.String(200)),
        sa.Column("prompt_hash", sa.String(64)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_events_issue_occurred", "events", ["issue_id", "occurred_at"])
    op.create_index("ix_events_session_occurred", "events", ["session_id", "occurred_at"])
    op.create_index("ix_events_type_occurred", "events", ["type", "occurred_at"])
    op.create_index("ix_events_occurred_at", "events", ["occurred_at"])

    # knowledge_entries
    op.create_table(
        "knowledge_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("category", postgresql.ENUM(name="knowledge_category", create_type=False), nullable=False),
        sa.Column("tags", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("scope_globs", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("use_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("supersedes_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_entries.id", ondelete="SET NULL")),
        sa.Column("contributed_by_session_id", postgresql.UUID(as_uuid=True)),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_knowledge_category", "knowledge_entries", ["category"])
    op.create_index("ix_knowledge_project", "knowledge_entries", ["project_id"])

    # notifications
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("recipient", sa.String(200), nullable=False),
        sa.Column("type", postgresql.ENUM(name="notification_type", create_type=False), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("body", sa.Text),
        sa.Column("payload", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_notifications_recipient", "notifications", ["recipient"])
    op.create_index("ix_notifications_unread", "notifications", ["is_read"])
    op.create_index("ix_notifications_project", "notifications", ["project_id"])

    # task_queue (Dispatch Plane — PG SKIP LOCKED)
    op.create_table(
        "task_queue",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        # ^ "queued" | "claimed" | "completed" | "failed" | "dead_letter"
        sa.Column("priority", sa.Integer, nullable=False, server_default="2"),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.Column("idempotency_key", sa.String(200), unique=True),
        sa.Column("issue_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("issues.id", ondelete="CASCADE")),
        sa.Column("workflow_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_runs.id", ondelete="CASCADE")),
        sa.Column("required_provider", sa.String(50)),
        sa.Column("claimed_by", sa.String(200)),
        sa.Column("claimed_at", sa.DateTime(timezone=True)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer, nullable=False, server_default="3"),
        sa.Column("last_error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_task_queue_status_priority", "task_queue", ["status", "priority", "created_at"])


def downgrade() -> None:
    op.drop_table("task_queue")
    op.drop_table("notifications")
    op.drop_table("knowledge_entries")
    op.drop_table("events")
    op.drop_table("scope_leases")
    op.drop_table("agent_sessions")
    op.drop_table("chat_sessions")
    op.drop_table("workflow_runs")
    op.drop_table("workflows")
    op.drop_table("skills")
    op.drop_table("agent_definitions")
    op.drop_table("comments")
    op.drop_table("issues")
    op.drop_table("projects")
    for enum_name in [
        "notification_type", "knowledge_category", "chat_source", "lease_status",
        "run_status", "failure_reason", "session_status", "comment_type",
        "issue_complexity", "issue_priority", "issue_status", "issue_type",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
