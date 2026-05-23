"""Approval gate — Phase H2.

Before dispatching a workflow run, verify the issue is allowed to execute.

Decision matrix:

  complexity   | status          | project.auto_execute_simple | allowed
  ------------ | --------------- | --------------------------- | -------
  simple       | any active*     | True                        | YES (auto-execute)
  simple       | any active*     | False                       | requires APPROVED
  medium       | APPROVED        | -                           | YES
  medium       | other           | -                           | NO (require_approval)
  complex      | APPROVED        | -                           | YES
  complex      | other           | -                           | NO (require_approval)
  None         | APPROVED        | -                           | YES
  None         | other           | -                           | NO (require_approval — Triager hasn't classified)

*active = NEW / TRIAGED / PLANNED  (not CLOSED / FAILED / WONT_FIX)
"""
from __future__ import annotations
from dataclasses import dataclass

from bumblebee.models.issue import Issue, IssueComplexity, IssueStatus
from bumblebee.models.project import Project


TERMINAL_STATUSES = {
    IssueStatus.CLOSED,
    IssueStatus.FAILED,
    IssueStatus.WONT_FIX,
    IssueStatus.RELEASED,
}


@dataclass(frozen=True)
class ApprovalDecision:
    allowed: bool
    reason: str
    auto: bool  # True if simple-auto-execute applied

    def __bool__(self) -> bool:  # pragma: no cover
        return self.allowed


def check_dispatch_allowed(issue: Issue, project: Project | None = None) -> ApprovalDecision:
    """Return ApprovalDecision. Caller raises 403/409 on .allowed=False."""
    if issue.status in TERMINAL_STATUSES:
        return ApprovalDecision(False, f"issue_in_terminal_state:{issue.status.value}", False)

    if issue.status == IssueStatus.APPROVED:
        return ApprovalDecision(True, "explicitly_approved", False)

    if issue.complexity == IssueComplexity.SIMPLE:
        policy = (project.policy_config if project and project.policy_config else {}) or {}
        if policy.get("auto_execute_simple", False):
            return ApprovalDecision(True, "auto_execute_simple_policy", True)
        return ApprovalDecision(False, "simple_needs_approval_disable_or_approve", False)

    return ApprovalDecision(
        False,
        f"needs_approval_complexity={issue.complexity.value if issue.complexity else 'unclassified'}",
        False,
    )
