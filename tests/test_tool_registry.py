"""Test: ToolRegistry â€” schema validation + role filtering."""
import pytest

from bumblebee.services.tool.registry import (
    TOOLS,
    tools_for_role,
    validate_tool_call,
)


def test_registry_has_minimum_tools():
    # Plan Â§7 enumerates 25 atomic tools; v3.0 starts with 12
    assert len(TOOLS) >= 12


def test_all_tools_have_examples():
    """Per plan: every tool has at least one example."""
    missing = [name for name, t in TOOLS.items() if not t.examples]
    assert missing == [], f"tools without examples: {missing}"


def test_assistant_sees_suggest_tools():
    role_tools = {t.name for t in tools_for_role("assistant")}
    assert "suggest_issue" in role_tools
    assert "suggest_knowledge_entry" in role_tools


def test_assistant_does_not_see_git_commit():
    """Assistant is read-only for code; no write/commit tools."""
    role_tools = {t.name for t in tools_for_role("assistant")}
    # git_commit isn't in registry yet, but write tools shouldn't be assistant-visible
    assert "release_scope_lease" not in role_tools  # only for implementers


def test_implementer_sees_lease_tools():
    role_tools = {t.name for t in tools_for_role("implementer")}
    assert "acquire_scope_lease" in role_tools
    assert "release_scope_lease" in role_tools
    assert "scratch_write" in role_tools


def test_validate_unknown_tool():
    ok, err = validate_tool_call("does_not_exist", {})
    assert ok is False
    assert "unknown_tool" in err


def test_validate_missing_required_field():
    ok, err = validate_tool_call("create_issue", {"title": "x"})  # missing project_slug
    assert ok is False
    assert "missing_field" in err
    assert "project_slug" in err


def test_validate_ok():
    ok, err = validate_tool_call(
        "create_issue", {"project_slug": "bb", "title": "x"}
    )
    assert ok is True
    assert err is None
