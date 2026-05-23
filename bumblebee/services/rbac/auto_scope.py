"""SQLAlchemy event listeners that auto-fill workspace_id from a parent row.

Many internal code paths (and legacy tests) construct rows that have a
`workspace_id` NOT NULL but only set `issue_id` or `project_id`. Rather than
audit every call site, we hook `before_insert` and copy the workspace_id from
the parent row when it's missing.

This is a safety net — production paths should set workspace_id explicitly so
the dependency is auditable. The listener exists to:
  1. Keep legacy code working through the Phase A migration.
  2. Prevent silent NULL-not-null crashes when a service forgets the scope.

Tables that auto-resolve from parents:
  agent_sessions.workspace_id        ← issues.workspace_id (via issue_id)
                                     ← workflow_runs.workspace_id (via workflow_run_id)
  events.workspace_id                ← issues.workspace_id (via issue_id)
                                     ← projects.workspace_id (via project_id)
                                     ← agent_sessions.workspace_id (via session_id)
  comments.workspace_id              ← issues.workspace_id (via issue_id)
  workflow_runs.workspace_id         ← issues.workspace_id (via issue_id)
                                     ← projects.workspace_id (via project_id)
  scope_leases.workspace_id          ← issues.workspace_id (via issue_id)
  notifications.workspace_id         ← issues.workspace_id (via issue_id)
                                     ← projects.workspace_id (via project_id)
  chat_sessions.workspace_id         ← projects.workspace_id (via project_id)
  issues.workspace_id                ← projects.workspace_id (via project_id)
"""
from __future__ import annotations
import logging

from sqlalchemy import event, inspect

log = logging.getLogger(__name__)


def _resolve_from_parent(connection, fk_column: str, parent_table: str, parent_id):
    """Look up workspace_id on a parent row via raw SQL (sync, before_insert is sync)."""
    if parent_id is None:
        return None
    row = connection.execute(
        f"SELECT workspace_id FROM {parent_table} WHERE id = '{parent_id}'".replace("'None'", "NULL"),  # noqa: S608
    ).first() if False else None
    # Above is intentionally unreachable — use parameterized below
    from sqlalchemy import text
    row = connection.execute(
        text(f"SELECT workspace_id FROM {parent_table} WHERE id = :pid"),
        {"pid": str(parent_id)},
    ).first()
    return row[0] if row else None


def _resolve_workspace_id(connection, parent_lookups: list[tuple[str, str, object]]):
    """Walk a list of (attr_name, parent_table, parent_id) and return the first non-null workspace_id found."""
    for _attr, table, pid in parent_lookups:
        if pid is None:
            continue
        ws = _resolve_from_parent(connection, "workspace_id", table, pid)
        if ws is not None:
            return ws
    return None


def _fetch_default_workspace_id(connection):
    """Last-resort fallback: pick the first workspace (alphabetical by created_at).

    Only used when no parent row carries a workspace_id AND the row being inserted
    has no FK to a parent — e.g. top-level Project / AgentDefinition / Workflow /
    KnowledgeEntry seeded by legacy scripts. Production code should set
    workspace_id explicitly.
    """
    from sqlalchemy import text
    row = connection.execute(
        text("SELECT id FROM workspaces WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1")
    ).first()
    return row[0] if row else None


def _make_listener(parent_lookups_for, *, fallback_to_default: bool = False):
    """Build a before_insert listener that auto-fills workspace_id from parents.

    parent_lookups_for: callable(target) -> list[(attr_name, parent_table, parent_id)]
    fallback_to_default: if True and no parent resolves, use first workspace as fallback.
    """

    def listener(mapper, connection, target):
        if getattr(target, "workspace_id", None) is not None:
            return
        from sqlalchemy import text
        for _attr, table, pid in parent_lookups_for(target):
            if pid is None:
                continue
            row = connection.execute(
                text(f"SELECT workspace_id FROM {table} WHERE id = :pid"),
                {"pid": str(pid)},
            ).first()
            if row and row[0] is not None:
                target.workspace_id = row[0]
                return
        if fallback_to_default:
            ws = _fetch_default_workspace_id(connection)
            if ws is not None:
                target.workspace_id = ws

    return listener


def register_auto_scope_listeners() -> None:
    """Wire all before_insert listeners. Idempotent — safe to call multiple times."""
    from bumblebee.models.agent_session import AgentSession
    from bumblebee.models.comment import Comment
    from bumblebee.models.event import Event
    from bumblebee.models.issue import Issue
    from bumblebee.models.notification import Notification
    from bumblebee.models.scope_lease import ScopeLease
    from bumblebee.models.workflow_run import WorkflowRun
    from bumblebee.models.chat_session import ChatSession
    from bumblebee.models.project import Project
    from bumblebee.models.workflow import Workflow
    from bumblebee.models.agent_definition import AgentDefinition
    from bumblebee.models.knowledge_entry import KnowledgeEntry
    from bumblebee.models.skill import Skill

    if getattr(register_auto_scope_listeners, "_registered", False):
        return

    event.listen(
        AgentSession, "before_insert",
        _make_listener(lambda t: [
            ("issue_id", "issues", t.issue_id),
            ("workflow_run_id", "workflow_runs", getattr(t, "workflow_run_id", None)),
            ("chat_session_id", "chat_sessions", getattr(t, "chat_session_id", None)),
        ]),
    )
    event.listen(
        Event, "before_insert",
        _make_listener(lambda t: [
            ("issue_id", "issues", t.issue_id),
            ("project_id", "projects", getattr(t, "project_id", None)),
            ("session_id", "agent_sessions", getattr(t, "session_id", None)),
        ]),
    )
    event.listen(
        Comment, "before_insert",
        _make_listener(lambda t: [("issue_id", "issues", t.issue_id)]),
    )
    event.listen(
        WorkflowRun, "before_insert",
        _make_listener(lambda t: [
            ("issue_id", "issues", getattr(t, "issue_id", None)),
            ("project_id", "projects", getattr(t, "project_id", None)),
        ]),
    )
    event.listen(
        ScopeLease, "before_insert",
        _make_listener(lambda t: [("issue_id", "issues", t.issue_id)]),
    )
    event.listen(
        Notification, "before_insert",
        _make_listener(lambda t: [
            ("issue_id", "issues", getattr(t, "issue_id", None)),
            ("project_id", "projects", getattr(t, "project_id", None)),
        ]),
    )
    event.listen(
        ChatSession, "before_insert",
        _make_listener(lambda t: [("project_id", "projects", getattr(t, "project_id", None))]),
    )
    event.listen(
        Issue, "before_insert",
        _make_listener(lambda t: [("project_id", "projects", t.project_id)]),
    )

    # Top-level entities (no parent row) — fallback to first workspace.
    # Used by legacy seed scripts that pre-date workspace tenancy.
    event.listen(
        Project, "before_insert",
        _make_listener(lambda t: [], fallback_to_default=True),
    )
    event.listen(
        Workflow, "before_insert",
        _make_listener(lambda t: [], fallback_to_default=True),
    )
    event.listen(
        AgentDefinition, "before_insert",
        _make_listener(lambda t: [], fallback_to_default=True),
    )
    event.listen(
        KnowledgeEntry, "before_insert",
        _make_listener(
            lambda t: [("project_id", "projects", getattr(t, "project_id", None))],
            fallback_to_default=True,
        ),
    )
    event.listen(
        Skill, "before_insert",
        _make_listener(lambda t: [], fallback_to_default=True),
    )

    register_auto_scope_listeners._registered = True
    log.info("auto-scope listeners registered")
