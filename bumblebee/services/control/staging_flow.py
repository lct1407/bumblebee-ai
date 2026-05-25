"""Staging branch transitions — Phase I1.

After a workflow's Reviewer approves, the issue moves through:

  DEVELOPED → DEPLOYING (merge feature branch into staging)
            → TESTING   (run e2e / smoke against staging)
            → STAGING   (resting in staging awaiting promotion)
            → RELEASED  (promoted to base/main)

Per-project staging branch via `projects.policy_config["staging_branch"]`
(default from settings.default_staging_branch, fallback "stg").

This module emits task_queue jobs that the worker daemon picks up; it does NOT
shell out to git directly (that lives on the worker).
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.config import get_settings
from bumblebee.models.issue import Issue, IssueStatus
from bumblebee.models.project import Project

VALID_TRANSITIONS: dict[IssueStatus, set[IssueStatus]] = {
    IssueStatus.IN_REVIEW: {IssueStatus.DEVELOPED, IssueStatus.FAILED},
    IssueStatus.DEVELOPED: {IssueStatus.DEPLOYING, IssueStatus.FAILED},
    IssueStatus.DEPLOYING: {IssueStatus.TESTING, IssueStatus.FAILED},
    IssueStatus.TESTING: {IssueStatus.STAGING, IssueStatus.FAILED},
    IssueStatus.STAGING: {IssueStatus.RELEASED, IssueStatus.FAILED, IssueStatus.REOPEN},
    IssueStatus.RELEASED: {IssueStatus.CLOSED, IssueStatus.REOPEN},
    IssueStatus.FAILED: {IssueStatus.REOPEN, IssueStatus.WONT_FIX, IssueStatus.CLOSED},
}


def staging_branch_for(project: Project | None) -> str:
    if project and project.policy_config:
        sb = project.policy_config.get("staging_branch")
        if sb:
            return sb
    return get_settings().default_staging_branch


def assert_transition(current: IssueStatus, target: IssueStatus) -> None:
    """Raise ValueError if `target` is not reachable from `current`."""
    allowed = VALID_TRANSITIONS.get(current, set())
    # Always allow same-status (idempotent), or moving back to NEW (reopen)
    if target == current:
        return
    if target == IssueStatus.REOPEN:
        return
    if target not in allowed:
        raise ValueError(
            f"invalid_transition: {current.value} → {target.value} "
            f"(allowed: {sorted(s.value for s in allowed)})"
        )


async def enqueue_merge_to_staging(
    db: AsyncSession,
    *,
    issue: Issue,
    project: Project,
    feature_branch: str,
) -> uuid.UUID:
    """Enqueue a worker task that performs the actual git merge on the user's machine."""
    from bumblebee.services.dispatch.task_queue import enqueue

    payload = {
        "command_kind": "merge_to_staging",
        "repo_path": project.repo_path,
        "feature_branch": feature_branch,
        "staging_branch": staging_branch_for(project),
        # The actual command the daemon runs (shell). Worker decides how to chain.
        "command": (
            f"git fetch --all && "
            f"git checkout {staging_branch_for(project)} && "
            f"git pull --ff-only && "
            f"git merge --no-ff --no-edit {feature_branch} && "
            f"git push origin {staging_branch_for(project)}"
        ),
    }
    task_id = await enqueue(
        db,
        payload=payload,
        issue_id=issue.id,
        required_provider="git",
        required_project_id=project.id,
        idempotency_key=f"merge-stg-{issue.id}-{feature_branch}",
    )
    issue.status = IssueStatus.DEPLOYING
    await db.flush()
    return task_id


async def enqueue_e2e_smoke(
    db: AsyncSession, *, issue: Issue, project: Project, gates: list[str],
) -> uuid.UUID:
    """Enqueue smoke/e2e suite. `gates` is a list like ['smoke', 'e2e:critical']."""
    from bumblebee.services.dispatch.task_queue import enqueue

    cmd_parts = []
    for g in gates:
        if g == "smoke":
            cmd_parts.append("npm run test:smoke || pytest -k smoke")
        elif g.startswith("e2e"):
            cmd_parts.append("npm run test:e2e || pytest -k e2e")

    payload = {
        "command_kind": "e2e_smoke",
        "repo_path": project.repo_path,
        "staging_branch": staging_branch_for(project),
        "gates": gates,
        "command": " && ".join(cmd_parts) if cmd_parts else "true",
    }
    task_id = await enqueue(
        db, payload=payload, issue_id=issue.id, required_provider="git",
        required_project_id=project.id,
        idempotency_key=f"e2e-{issue.id}-{','.join(gates)}",
    )
    issue.status = IssueStatus.TESTING
    await db.flush()
    return task_id
