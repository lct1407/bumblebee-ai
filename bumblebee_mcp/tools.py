"""MCP tool implementations + JSON schemas.

Each tool:
1. Declares an MCP-spec inputSchema
2. Declares required Permission for RBAC gate
3. Calls into the existing Bumblebee service layer (NOT through HTTP)
4. Returns a dict serializable to MCP `content` blocks

Production paths should set workspace_id explicitly when querying — we never trust
the agent's word; the workspace scope comes from the resolved API key (McpAuthContext).
"""
from __future__ import annotations
import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.event import Event
from bumblebee.models.issue import Issue, IssuePriority, IssueStatus, IssueType
from bumblebee.models.project import Project
from bumblebee.models.workflow_run import WorkflowRun
from bumblebee.services.rbac.permissions import Permission, has_permission
from bumblebee_mcp.auth import McpAuthContext


@dataclass
class McpTool:
    name: str
    description: str
    input_schema: dict
    required_permission: Permission
    handler: Callable[[AsyncSession, McpAuthContext, dict], Awaitable[dict]]


# ---------- Helpers ----------


def _issue_to_dict(i: Issue) -> dict:
    return {
        "id": str(i.id),
        "number": i.number,
        "title": i.title,
        "description": i.description,
        "status": i.status.value if hasattr(i.status, "value") else str(i.status),
        "priority": i.priority.value if hasattr(i.priority, "value") else str(i.priority),
        "type": i.type.value if hasattr(i.type, "value") else str(i.type),
        "complexity": i.complexity.value if i.complexity and hasattr(i.complexity, "value") else None,
        "scope_hints": i.scope_hints or [],
        "ai_confidence": i.ai_confidence,
        "ai_summary": i.ai_summary,
        "project_id": str(i.project_id),
        "created_at": i.created_at.isoformat() if i.created_at else None,
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }


def _event_to_dict(e: Event) -> dict:
    return {
        "id": str(e.id),
        "type": e.type,
        "payload": e.payload or {},
        "issue_id": str(e.issue_id) if e.issue_id else None,
        "session_id": str(e.session_id) if e.session_id else None,
        "actor": e.actor,
        "source": e.source,
        "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
    }


# ---------- Tool handlers ----------


async def list_issues(db: AsyncSession, ctx: McpAuthContext, args: dict) -> dict:
    """List issues in the auth'd workspace, optionally filtered."""
    stmt = select(Issue).where(Issue.workspace_id == ctx.workspace_id)
    if status := args.get("status"):
        try:
            stmt = stmt.where(Issue.status == IssueStatus(status))
        except ValueError:
            pass
    if typ := args.get("type"):
        try:
            stmt = stmt.where(Issue.type == IssueType(typ))
        except ValueError:
            pass
    if priority := args.get("priority"):
        try:
            stmt = stmt.where(Issue.priority == IssuePriority(priority))
        except ValueError:
            pass

    limit = min(int(args.get("limit", 50)), 100)
    stmt = stmt.order_by(Issue.number.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "issues": [_issue_to_dict(i) for i in rows],
        "count": len(rows),
        "workspace_id": str(ctx.workspace_id),
    }


async def get_issue(db: AsyncSession, ctx: McpAuthContext, args: dict) -> dict:
    """Fetch a single issue by number within the auth'd workspace."""
    number = int(args["number"])
    stmt = select(Issue).where(
        Issue.workspace_id == ctx.workspace_id, Issue.number == number
    )
    issue = (await db.execute(stmt)).scalar_one_or_none()
    if not issue:
        raise ValueError(f"issue #{number} not found in this workspace")
    return _issue_to_dict(issue)


async def create_issue(db: AsyncSession, ctx: McpAuthContext, args: dict) -> dict:
    """File a new issue. Picks the user's first project in the workspace by default."""
    title = args["title"].strip()
    if not title:
        raise ValueError("title required")

    # Resolve project — by slug if given, else first project in workspace
    project = None
    if slug := args.get("project_slug"):
        project = (
            await db.execute(
                select(Project).where(
                    Project.workspace_id == ctx.workspace_id, Project.slug == slug
                )
            )
        ).scalar_one_or_none()
        if not project:
            raise ValueError(f"project '{slug}' not found in this workspace")
    else:
        project = (
            await db.execute(
                select(Project)
                .where(Project.workspace_id == ctx.workspace_id)
                .order_by(Project.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if not project:
            raise ValueError("no project exists in this workspace; create one first")

    # Next issue number
    from sqlalchemy import func
    max_num = (
        await db.execute(
            select(func.coalesce(func.max(Issue.number), 0)).where(
                Issue.project_id == project.id
            )
        )
    ).scalar() or 0

    issue = Issue(
        workspace_id=ctx.workspace_id,
        project_id=project.id,
        number=max_num + 1,
        title=title,
        description=args.get("description"),
        type=IssueType(args.get("type", "task")),
        priority=IssuePriority(args.get("priority", "medium")),
        status=IssueStatus.NEW,
        scope_hints=args.get("scope_hints", []),
    )
    db.add(issue)
    await db.commit()
    await db.refresh(issue)
    return _issue_to_dict(issue)


async def trigger_workflow(db: AsyncSession, ctx: McpAuthContext, args: dict) -> dict:
    """Trigger a workflow run on an issue. Returns the run id + initial status."""
    issue_number = int(args["issue_number"])
    issue = (
        await db.execute(
            select(Issue).where(
                Issue.workspace_id == ctx.workspace_id, Issue.number == issue_number
            )
        )
    ).scalar_one_or_none()
    if not issue:
        raise ValueError(f"issue #{issue_number} not found")

    # Delegate to the existing workflow runner (defensive import — heavy deps)
    from bumblebee.services.control.orchestrator import execute_workflow_run

    workflow_name = args.get("workflow_name")  # None → default workflow
    result = await execute_workflow_run(
        db, issue_id=issue.id, workflow_name=workflow_name
    )
    return {
        "workflow_run_id": str(result.workflow_run_id) if hasattr(result, "workflow_run_id") else str(result.id),
        "workflow_name": getattr(result, "workflow_name", workflow_name or "default"),
        "status": getattr(result, "status", "started"),
        "issue_number": issue_number,
    }


async def get_events(db: AsyncSession, ctx: McpAuthContext, args: dict) -> dict:
    """List recent events for an issue or the entire workspace."""
    stmt = select(Event).where(Event.workspace_id == ctx.workspace_id)
    if issue_number := args.get("issue_number"):
        # Resolve the issue id
        issue = (
            await db.execute(
                select(Issue).where(
                    Issue.workspace_id == ctx.workspace_id,
                    Issue.number == int(issue_number),
                )
            )
        ).scalar_one_or_none()
        if not issue:
            raise ValueError(f"issue #{issue_number} not found")
        stmt = stmt.where(Event.issue_id == issue.id)

    limit = min(int(args.get("limit", 50)), 200)
    stmt = stmt.order_by(Event.occurred_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "events": [_event_to_dict(e) for e in rows],
        "count": len(rows),
    }


# ---------- Tool registry ----------


TOOLS: list[McpTool] = [
    McpTool(
        name="bumblebee_list_issues",
        description="List issues in the current workspace. Filters: status, type, priority, limit (max 100).",
        input_schema={
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Filter by status (new/triaged/.../closed)"},
                "type": {"type": "string", "description": "bug/feature/task/story/epic/chore/spike"},
                "priority": {"type": "string", "description": "critical/high/medium/low/none"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 50},
            },
        },
        required_permission=Permission.READ_ISSUE,
        handler=list_issues,
    ),
    McpTool(
        name="bumblebee_get_issue",
        description="Fetch full details of a single issue by its per-project number.",
        input_schema={
            "type": "object",
            "required": ["number"],
            "properties": {
                "number": {"type": "integer", "description": "Issue number (the X in BB-X)"},
            },
        },
        required_permission=Permission.READ_ISSUE,
        handler=get_issue,
    ),
    McpTool(
        name="bumblebee_create_issue",
        description="File a new issue in the current workspace. Uses the first project if project_slug is omitted.",
        input_schema={
            "type": "object",
            "required": ["title"],
            "properties": {
                "title": {"type": "string", "description": "Short, descriptive title"},
                "description": {"type": "string", "description": "Markdown body, may include `## Acceptance criteria` etc."},
                "type": {"type": "string", "enum": ["bug", "feature", "task", "story", "epic", "chore", "spike"], "default": "task"},
                "priority": {"type": "string", "enum": ["critical", "high", "medium", "low", "none"], "default": "medium"},
                "project_slug": {"type": "string", "description": "Target project (omit for default)"},
                "scope_hints": {"type": "array", "items": {"type": "string"}, "description": "File/path patterns the agent should focus on"},
            },
        },
        required_permission=Permission.WRITE_ISSUE,
        handler=create_issue,
    ),
    McpTool(
        name="bumblebee_trigger_workflow",
        description="Start an autonomous workflow run on an existing issue (triage → analyze → implement → test).",
        input_schema={
            "type": "object",
            "required": ["issue_number"],
            "properties": {
                "issue_number": {"type": "integer"},
                "workflow_name": {"type": "string", "description": "Optional — defaults to project's default workflow"},
            },
        },
        required_permission=Permission.TRIGGER_WORKFLOW,
        handler=trigger_workflow,
    ),
    McpTool(
        name="bumblebee_get_events",
        description="Read the event log for an issue (or the entire workspace if no issue specified). Returns most-recent first.",
        input_schema={
            "type": "object",
            "properties": {
                "issue_number": {"type": "integer", "description": "Scope to this issue"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50},
            },
        },
        required_permission=Permission.READ_ISSUE,
        handler=get_events,
    ),
]


TOOLS_BY_NAME: dict[str, McpTool] = {t.name: t for t in TOOLS}

# Gemini-backed tools self-register into TOOLS + TOOLS_BY_NAME via gemini_tools.py.
# Import-trigger lives in bumblebee_mcp/__init__.py so any consumer of this module
# gets the full catalog regardless of import order.


async def dispatch(db: AsyncSession, ctx: McpAuthContext, name: str, args: dict) -> dict:
    """Dispatch a tool call after permission gate."""
    tool = TOOLS_BY_NAME.get(name)
    if not tool:
        raise ValueError(f"unknown tool: {name}")
    if not has_permission(ctx.role, tool.required_permission):
        raise PermissionError(
            f"role '{ctx.role.value}' lacks permission '{tool.required_permission.value}'"
        )
    return await tool.handler(db, ctx, args or {})
