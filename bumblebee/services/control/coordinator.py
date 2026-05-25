"""Coordinator — Phase 4 supervisor that decomposes Complex issues.

Phase 1.5+ scaffold: parses LLM JSON output; persists sub-issues; dispatches.
Real LLM-driven decomposition requires Phase 1 real harness (provider=claude-cli).
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.models.issue import Issue, IssueStatus, IssueType
from bumblebee.services.dispatch.task_queue import enqueue
from bumblebee.services.state.event_log import append_event


async def decompose_and_dispatch(
    db: AsyncSession,
    parent_issue: Issue,
    decomposition: dict,
    coordinator_session: AgentSession,
) -> list[Issue]:
    """Given a Coordinator's decomposition output, create sub-issues + enqueue tasks.

    decomposition format:
        {plan_summary: str, sub_tasks: [{role, title, description, scope}, ...]}
    """
    sub_tasks = decomposition.get("sub_tasks", [])
    plan_summary = decomposition.get("plan_summary", "")
    if not sub_tasks:
        return []

    # Validate disjoint scopes (Phase 4 baseline: warn if overlap)
    [t.get("scope", []) for t in sub_tasks]
    # (production-grade overlap check via LeaseManager._globs_overlap; skip for stub)

    # Get current max number for project
    max_num = (
        await db.execute(
            select(func.coalesce(func.max(Issue.number), 0)).where(
                Issue.project_id == parent_issue.project_id
            )
        )
    ).scalar() or 0

    children: list[Issue] = []
    for i, task_spec in enumerate(sub_tasks):
        child = Issue(
            project_id=parent_issue.project_id,
            parent_id=parent_issue.id,
            number=max_num + 1 + i,
            title=task_spec.get("title", f"sub-task {i+1}"),
            description=task_spec.get("description", ""),
            scope_hints=task_spec.get("scope", []),
            type=IssueType.TASK,
            status=IssueStatus.PLANNED,
        )
        db.add(child)
        await db.flush()
        children.append(child)

        # Enqueue task (default sub-task workflow read from project policy or task_spec)
        default_subtask_workflow = task_spec.get(
            "workflow",
            parent_issue.session_context.get("default_subtask_workflow", "default-flow"),
        )
        await enqueue(
            db,
            payload={
                "issue_id": str(child.id),
                "role": task_spec.get("role", "implementer"),
                "workflow": default_subtask_workflow,
            },
            issue_id=child.id,
            priority=1,
            idempotency_key=f"coord-{parent_issue.id}-sub-{i}",
        )

    await append_event(
        db,
        type="plan_complete",
        session_id=coordinator_session.id,
        issue_id=parent_issue.id,
        payload={
            "plan_summary": plan_summary,
            "sub_tasks": [{"child_id": str(c.id), "number": c.number} for c in children],
        },
        source="agent",
        actor="coordinator",
    )
    return children


async def aggregate_check(db: AsyncSession, parent_issue: Issue) -> bool:
    """Check if all child issues are resolved/closed. Returns True if all done."""
    children = (
        await db.execute(
            select(Issue).where(Issue.parent_id == parent_issue.id, Issue.deleted_at.is_(None))
        )
    ).scalars().all()
    if not children:
        return False
    terminal = {IssueStatus.CLOSED, IssueStatus.RELEASED, IssueStatus.IN_REVIEW}
    return all(c.status in terminal for c in children)
