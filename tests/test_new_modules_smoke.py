"""BB-14: smoke tests for modules added in 2026-05 session.

Covers:
- services/safety/approval_gate
- services/control/workflow_selector
- services/control/staging_flow (helpers)
- services/execution/context_assembler (source-aware)
- services/project_repo/validator
- installer/bundler (claude-code, cursor, codex, generic targets)
- worker/daemon helpers (_extract_diff)
- routers/webhooks_github._scan_commit_for_actionables
- routers/metrics (counter)
"""
from __future__ import annotations
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest


# ---- approval_gate -------------------------------------------------------

def test_approval_gate_simple_approved_passes():
    from bumblebee.models.issue import IssueStatus, IssueComplexity
    from bumblebee.services.safety.approval_gate import check_dispatch_allowed

    issue = SimpleNamespace(status=IssueStatus.APPROVED, complexity=IssueComplexity.SIMPLE)
    d = check_dispatch_allowed(issue, project=None)
    assert d.allowed is True
    assert d.reason == "explicitly_approved"


def test_approval_gate_simple_auto_execute_policy():
    from bumblebee.models.issue import IssueStatus, IssueComplexity
    from bumblebee.services.safety.approval_gate import check_dispatch_allowed

    issue = SimpleNamespace(status=IssueStatus.NEW, complexity=IssueComplexity.SIMPLE)
    project = SimpleNamespace(policy_config={"auto_execute_simple": True})
    d = check_dispatch_allowed(issue, project=project)
    assert d.allowed is True
    assert d.auto is True


def test_approval_gate_complex_new_blocked():
    from bumblebee.models.issue import IssueStatus, IssueComplexity
    from bumblebee.services.safety.approval_gate import check_dispatch_allowed

    issue = SimpleNamespace(status=IssueStatus.NEW, complexity=IssueComplexity.COMPLEX)
    d = check_dispatch_allowed(issue, project=None)
    assert d.allowed is False
    assert "complexity=complex" in d.reason


def test_approval_gate_terminal_state_blocked():
    from bumblebee.models.issue import IssueStatus, IssueComplexity
    from bumblebee.services.safety.approval_gate import check_dispatch_allowed

    issue = SimpleNamespace(status=IssueStatus.CLOSED, complexity=IssueComplexity.SIMPLE)
    d = check_dispatch_allowed(issue, project=None)
    assert d.allowed is False
    assert "terminal" in d.reason


# ---- workflow_selector ---------------------------------------------------

def test_workflow_selector_simple_picks_simple_fix_flow():
    from bumblebee.models.issue import IssueComplexity
    from bumblebee.services.control.workflow_selector import select_workflow_name

    issue = SimpleNamespace(complexity=IssueComplexity.SIMPLE)
    assert select_workflow_name(issue) == "simple-fix-flow"


def test_workflow_selector_complex_picks_feature_complex_flow():
    from bumblebee.models.issue import IssueComplexity
    from bumblebee.services.control.workflow_selector import select_workflow_name

    issue = SimpleNamespace(complexity=IssueComplexity.COMPLEX)
    assert select_workflow_name(issue) == "feature-complex-flow"


def test_workflow_selector_project_override_wins():
    from bumblebee.models.issue import IssueComplexity
    from bumblebee.services.control.workflow_selector import select_workflow_name

    issue = SimpleNamespace(complexity=IssueComplexity.COMPLEX)
    project = SimpleNamespace(policy_config={"workflow_overrides": {"complex": "chat-assistant-flow"}})
    assert select_workflow_name(issue, project) == "chat-assistant-flow"


def test_workflow_selector_none_falls_back_to_simple():
    from bumblebee.services.control.workflow_selector import select_workflow_name

    issue = SimpleNamespace(complexity=None)
    assert select_workflow_name(issue) == "simple-fix-flow"


# ---- staging_flow --------------------------------------------------------

def test_staging_branch_for_default():
    from bumblebee.services.control.staging_flow import staging_branch_for
    project = SimpleNamespace(policy_config=None)
    assert staging_branch_for(project) == "stg"


def test_staging_branch_for_override():
    from bumblebee.services.control.staging_flow import staging_branch_for
    project = SimpleNamespace(policy_config={"staging_branch": "develop"})
    assert staging_branch_for(project) == "develop"


def test_staging_assert_transition_valid():
    from bumblebee.models.issue import IssueStatus
    from bumblebee.services.control.staging_flow import assert_transition
    # DEVELOPED -> DEPLOYING
    assert_transition(IssueStatus.DEVELOPED, IssueStatus.DEPLOYING)
    # DEPLOYING -> TESTING
    assert_transition(IssueStatus.DEPLOYING, IssueStatus.TESTING)


def test_staging_assert_transition_invalid_raises():
    from bumblebee.models.issue import IssueStatus
    from bumblebee.services.control.staging_flow import assert_transition

    with pytest.raises(ValueError):
        assert_transition(IssueStatus.NEW, IssueStatus.RELEASED)


# ---- context_assembler source-aware --------------------------------------

def test_collect_source_snippets_reads_file(tmp_path):
    from bumblebee.services.execution.context_assembler import _collect_source_snippets

    # Create a tiny git-like repo
    (tmp_path / ".git").mkdir()
    (tmp_path / "src").mkdir()
    src = tmp_path / "src" / "auth.py"
    src.write_text("def login(): return 42\n")

    project = SimpleNamespace(repo_path=str(tmp_path))
    issue = SimpleNamespace(scope_hints=["src/auth.py"], project=project)

    out = _collect_source_snippets(issue)
    assert "src/auth.py" in out
    assert "def login" in out


def test_collect_source_snippets_no_repo_returns_empty():
    from bumblebee.services.execution.context_assembler import _collect_source_snippets

    project = SimpleNamespace(repo_path=None)
    issue = SimpleNamespace(scope_hints=["src/x.py"], project=project)
    assert _collect_source_snippets(issue) == ""


def test_collect_source_snippets_glob_matching(tmp_path):
    from bumblebee.services.execution.context_assembler import _collect_source_snippets

    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "a.py").write_text("# a")
    (tmp_path / "lib" / "b.py").write_text("# b")
    project = SimpleNamespace(repo_path=str(tmp_path))
    issue = SimpleNamespace(scope_hints=["lib/*.py"], project=project)
    out = _collect_source_snippets(issue)
    assert "lib/a.py" in out and "lib/b.py" in out


# ---- project_repo validator ----------------------------------------------

def test_validate_repo_https_url():
    from bumblebee.services.project_repo import validate_repo_path
    v = validate_repo_path("https://github.com/lct1407/bumblebee")
    assert v.ok is True
    assert v.kind == "https"
    assert v.normalized.endswith(".git")


def test_validate_repo_ssh_url():
    from bumblebee.services.project_repo import validate_repo_path
    v = validate_repo_path("git@github.com:lct1407/bumblebee.git")
    assert v.ok is True
    assert v.kind == "ssh"


def test_validate_repo_owner_slash_repo():
    from bumblebee.services.project_repo import validate_repo_path
    v = validate_repo_path("lct1407/bumblebee")
    assert v.ok is True
    assert "github.com" in v.normalized


def test_validate_repo_local_nonexistent():
    from bumblebee.services.project_repo import validate_repo_path
    v = validate_repo_path("/nonexistent/path")
    assert v.ok is False


def test_validate_repo_local_valid(tmp_path):
    from bumblebee.services.project_repo import validate_repo_path
    (tmp_path / ".git").mkdir()
    v = validate_repo_path(str(tmp_path))
    assert v.ok is True
    assert v.kind == "local"


def test_validate_repo_invalid():
    from bumblebee.services.project_repo import validate_repo_path
    v = validate_repo_path("garbage")
    assert v.ok is False


# ---- installer bundler ---------------------------------------------------

def test_installer_claude_code(tmp_path):
    from bumblebee.installer import install_bundle
    files = install_bundle("claude-code", tmp_path)
    assert len(files) > 0
    # at least one agent file written
    agent_files = list((tmp_path / ".claude" / "agents").glob("bumblebee-*.md"))
    assert len(agent_files) >= 5
    # SKILL.md written
    assert (tmp_path / ".claude" / "skills" / "bumblebee" / "SKILL.md").exists()


def test_installer_codex_idempotent(tmp_path):
    from bumblebee.installer import install_bundle
    install_bundle("codex", tmp_path)
    # Run again — should not duplicate block
    install_bundle("codex", tmp_path)
    body = (tmp_path / "AGENTS.md").read_text(encoding="utf-8")
    assert body.count("<!-- bumblebee-bundle:start -->") == 1


def test_installer_unknown_target_raises(tmp_path):
    from bumblebee.installer import install_bundle
    with pytest.raises(ValueError):
        install_bundle("unknown-tool", tmp_path)


# ---- daemon helpers ------------------------------------------------------

def test_daemon_extract_diff_from_fenced():
    from bumblebee.worker.daemon import _extract_diff
    text = "Here is the patch:\n\n```diff\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n```\nend"
    out = _extract_diff(text)
    assert out is not None
    assert out.startswith("diff --git")


def test_daemon_extract_diff_raw_fallback():
    from bumblebee.worker.daemon import _extract_diff
    text = "Some preamble\ndiff --git a/foo b/foo\n--- a/foo\n+++ b/foo\nbody"
    out = _extract_diff(text)
    assert out is not None
    assert out.startswith("diff --git")


def test_daemon_extract_diff_no_match():
    from bumblebee.worker.daemon import _extract_diff
    assert _extract_diff("just plain text, no diff") is None


# ---- github webhook scan -------------------------------------------------

def test_github_scan_fix_pattern():
    from bumblebee.routers.webhooks_github import _scan_commit_for_actionables
    out = _scan_commit_for_actionables("fix #42 login broken")
    assert ("fix", "login broken") in out


def test_github_scan_todo_pattern():
    from bumblebee.routers.webhooks_github import _scan_commit_for_actionables
    out = _scan_commit_for_actionables("TODO: refactor auth module")
    assert ("todo", "refactor auth module") in out


def test_github_scan_fixme_marker_normalized_to_fix():
    from bumblebee.routers.webhooks_github import _scan_commit_for_actionables
    out = _scan_commit_for_actionables("FIXME: bcrypt rounds")
    assert ("fix", "bcrypt rounds") in out


def test_github_scan_no_pattern_returns_empty():
    from bumblebee.routers.webhooks_github import _scan_commit_for_actionables
    assert _scan_commit_for_actionables("just a normal commit") == []


# ---- metrics counter -----------------------------------------------------

def test_metrics_inc_counter():
    from bumblebee.routers.metrics import inc, _counters
    before = _counters.get("test_metric", 0)
    inc("test_metric", 3)
    assert _counters["test_metric"] == before + 3
