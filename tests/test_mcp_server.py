"""Phase B — MCP server tool dispatch + RBAC tests.

Direct unit tests against the dispatch layer (not full MCP transport — that's
verified via the smoke-test CLI). Covers:
- list_tools registry exposes all 5
- list_issues filters by workspace_id
- create_issue + get_issue roundtrip
- permission gate: viewer can't write
- cross-workspace isolation: tool can't reach other workspace's issues
- unknown tool → ValueError
"""
from __future__ import annotations
import uuid

import pytest
from sqlalchemy import text

from bumblebee.models.workspace import WorkspaceRole
from bumblebee_mcp.auth import McpAuthContext
from bumblebee_mcp.tools import TOOLS, TOOLS_BY_NAME, dispatch


def _ctx(workspace_id: uuid.UUID, role: WorkspaceRole = WorkspaceRole.MEMBER) -> McpAuthContext:
    return McpAuthContext(
        api_key_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        workspace_id=workspace_id,
        role=role,
    )


def test_tool_registry_has_core_tools():
    """5 core MCP tools must always be present; Gemini-backed tools register on top."""
    names = {t.name for t in TOOLS}
    core = {
        "bumblebee_list_issues",
        "bumblebee_get_issue",
        "bumblebee_create_issue",
        "bumblebee_trigger_workflow",
        "bumblebee_get_events",
    }
    assert core.issubset(names), f"missing core tools: {core - names}"
    # Gemini tools may or may not register depending on dependency availability
    assert len(TOOLS) >= len(core)


def test_each_tool_has_required_permission():
    for t in TOOLS:
        assert t.required_permission is not None
        assert t.input_schema["type"] == "object"


@pytest.mark.asyncio
async def test_list_issues_scoped_to_workspace(clean_db, seed_workspace_id):
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await dispatch(clean_db, ctx, "bumblebee_list_issues", {})
    assert result["count"] >= 3  # seed has 3 issues
    assert all(uuid.UUID(i["id"]) for i in result["issues"])


@pytest.mark.asyncio
async def test_get_issue_returns_seed_issue(clean_db, seed_workspace_id):
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await dispatch(clean_db, ctx, "bumblebee_get_issue", {"number": 1})
    assert result["number"] == 1
    assert result["title"]


@pytest.mark.asyncio
async def test_create_issue_via_tool(clean_db, seed_workspace_id):
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await dispatch(
        clean_db, ctx, "bumblebee_create_issue",
        {"title": "Created via MCP", "type": "feature", "priority": "high"},
    )
    assert result["title"] == "Created via MCP"
    assert result["type"] == "feature"
    assert result["priority"] == "high"
    assert result["status"] == "new"


@pytest.mark.asyncio
async def test_viewer_cannot_create_issue(clean_db, seed_workspace_id):
    ctx = _ctx(seed_workspace_id, WorkspaceRole.VIEWER)
    with pytest.raises(PermissionError) as exc:
        await dispatch(
            clean_db, ctx, "bumblebee_create_issue",
            {"title": "should fail"},
        )
    assert "write_issue" in str(exc.value)


@pytest.mark.asyncio
async def test_viewer_can_read_issues(clean_db, seed_workspace_id):
    ctx = _ctx(seed_workspace_id, WorkspaceRole.VIEWER)
    result = await dispatch(clean_db, ctx, "bumblebee_list_issues", {})
    assert result["count"] >= 3


@pytest.mark.asyncio
async def test_cross_workspace_isolation(clean_db, seed_workspace_id):
    """An MCP context bound to a different workspace must not see seed issues."""
    other_ws_id = uuid.uuid4()
    # Create a stranger workspace
    await clean_db.execute(
        text(
            """
            INSERT INTO workspaces (id, name, slug, owner_user_id, plan, llm_spend_cents_this_period,
                                    payment_overdue, settings, created_at, updated_at)
            SELECT :id, 'Stranger', :slug, id, 'free', 0, false, '{}'::jsonb, now(), now()
            FROM users WHERE username = 'seed' LIMIT 1
            """
        ),
        {"id": other_ws_id, "slug": f"stranger-{uuid.uuid4().hex[:6]}"},
    )
    await clean_db.commit()

    ctx = _ctx(other_ws_id, WorkspaceRole.OWNER)
    result = await dispatch(clean_db, ctx, "bumblebee_list_issues", {})
    assert result["count"] == 0


@pytest.mark.asyncio
async def test_unknown_tool_raises(clean_db, seed_workspace_id):
    ctx = _ctx(seed_workspace_id, WorkspaceRole.OWNER)
    with pytest.raises(ValueError) as exc:
        await dispatch(clean_db, ctx, "bumblebee_not_a_tool", {})
    assert "unknown tool" in str(exc.value)


@pytest.mark.asyncio
async def test_get_events_returns_workspace_events(clean_db, seed_workspace_id):
    """Smoke — events table is empty at clean_db start, but the call must succeed."""
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await dispatch(clean_db, ctx, "bumblebee_get_events", {"limit": 10})
    assert "events" in result
    assert "count" in result


@pytest.mark.asyncio
async def test_get_issue_404_for_nonexistent_number(clean_db, seed_workspace_id):
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    with pytest.raises(ValueError) as exc:
        await dispatch(clean_db, ctx, "bumblebee_get_issue", {"number": 9999})
    assert "not found" in str(exc.value)
