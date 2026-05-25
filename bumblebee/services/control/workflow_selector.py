"""Complexity → workflow auto-router. Phase H1.

Maps an Issue's complexity (set by Triager) to the right workflow YAML.

Rules:
  simple   -> simple-fix-flow      (linear: implementer -> tester -> review)
  medium   -> simple-fix-flow      (same path, Triager will have set finer scope)
  complex  -> feature-complex-flow (Coordinator decomposes -> parallel implementers)
  None     -> simple-fix-flow      (Triager hasn't run yet; default safe)

Per-project override via projects.policy_config.workflow_overrides = {complexity: name}.
"""
from __future__ import annotations

from bumblebee.models.issue import Issue, IssueComplexity
from bumblebee.models.project import Project

DEFAULT_WORKFLOW_BY_COMPLEXITY: dict[IssueComplexity | None, str] = {
    IssueComplexity.SIMPLE: "simple-fix-flow",
    IssueComplexity.MEDIUM: "simple-fix-flow",
    IssueComplexity.COMPLEX: "feature-complex-flow",
    None: "simple-fix-flow",
}


def select_workflow_name(issue: Issue, project: Project | None = None) -> str:
    """Return the workflow YAML name to run for this issue.

    Per-project override (policy_config.workflow_overrides) wins over defaults.
    """
    overrides: dict = {}
    if project and project.policy_config:
        overrides = project.policy_config.get("workflow_overrides", {}) or {}

    key = issue.complexity.value if issue.complexity else None
    if key and key in overrides:
        return overrides[key]
    return DEFAULT_WORKFLOW_BY_COMPLEXITY.get(issue.complexity, "simple-fix-flow")
