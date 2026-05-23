"""Phase: Gemini-backed MCP tools (smart_create_issue + ask_workspace).

These tests cover the wire-up + RBAC + tolerant-JSON parsing. They do NOT make
live Gemini calls — the GeminiProvider is monkey-patched to a deterministic stub.
For live verification, run scripts/test-gemini-mcp-live.py once GEMINI_API_KEY
or VERTEX_AI_API_KEY is configured AND the Gemini API is enabled in the project.
"""
from __future__ import annotations
import json
import uuid

import pytest

from bumblebee.models.workspace import WorkspaceRole
from bumblebee.services.execution.llm_provider import LLMResponse
from bumblebee_mcp.auth import McpAuthContext


def _ctx(workspace_id: uuid.UUID, role: WorkspaceRole = WorkspaceRole.MEMBER) -> McpAuthContext:
    return McpAuthContext(
        api_key_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        workspace_id=workspace_id,
        role=role,
    )


@pytest.fixture
def stub_gemini(monkeypatch):
    """Patch GeminiProvider.invoke to return deterministic JSON."""
    async def fake_invoke(self, prompt, max_tokens=4096):
        if "draft" in prompt.system.lower() or "issue-drafting" in prompt.system.lower():
            return LLMResponse(
                text=json.dumps({
                    "title": "Fix bcrypt cost factor too low",
                    "type": "bug",
                    "priority": "high",
                    "description": "## Overview\nbcrypt cost 10 is below the 2026 standard of 12+.\n\n## Acceptance criteria\n- [ ] Cost factor is 12\n- [ ] Existing hashes still verify",
                    "scope_hints": ["bumblebee/auth/security.py"],
                    "rationale": "Security regression — login hashing weakness",
                }),
                tokens_in=80, tokens_out=140, model="gemini-stub", finish_reason="stop",
            )
        # Q&A path
        return LLMResponse(
            text="There are 3 open issues in this workspace. BB-1 covers the health endpoint.\n\nSources: BB-1",
            tokens_in=400, tokens_out=30, model="gemini-stub", finish_reason="stop",
        )

    import bumblebee.services.execution.llm_provider as mod
    monkeypatch.setattr(mod.GeminiProvider, "invoke", fake_invoke)
    return fake_invoke


@pytest.mark.asyncio
async def test_smart_create_issue_returns_draft(clean_db, seed_workspace_id, stub_gemini):
    """Default behavior: draft without persisting."""
    from bumblebee_mcp.gemini_tools import smart_create_issue
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await smart_create_issue(
        clean_db, ctx,
        {"prompt": "fix bcrypt cost factor too low — security regression"},
    )
    assert result["status"] == "success"
    assert result["data"]["title"]
    assert result["data"]["type"] == "bug"
    assert result["data"]["priority"] == "high"
    # No issue persisted
    assert "issue" not in result["data"]


@pytest.mark.asyncio
async def test_smart_create_issue_with_commit_persists(clean_db, seed_workspace_id, stub_gemini):
    """commit=true + sufficient permission → issue actually created."""
    from bumblebee_mcp.gemini_tools import smart_create_issue
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await smart_create_issue(
        clean_db, ctx,
        {"prompt": "fix bcrypt", "commit": True},
    )
    assert result["status"] == "success"
    assert result["data"]["issue"]["id"]
    assert result["data"]["issue"]["title"] == "Fix bcrypt cost factor too low"
    assert "Created issue:" in result["summary"]


@pytest.mark.asyncio
async def test_smart_create_issue_viewer_cannot_commit(clean_db, seed_workspace_id, stub_gemini):
    """Viewers can draft but can't commit (lack write_issue)."""
    from bumblebee_mcp.gemini_tools import smart_create_issue
    ctx = _ctx(seed_workspace_id, WorkspaceRole.VIEWER)
    result = await smart_create_issue(
        clean_db, ctx,
        {"prompt": "anything", "commit": True},
    )
    # Still returns success-ish with a warning + draft, but no issue created
    assert result["status"] in ("warning", "error")
    assert "issue" not in result.get("data") or "issue" not in result["data"]


@pytest.mark.asyncio
async def test_smart_create_issue_missing_prompt_errors(clean_db, seed_workspace_id):
    """Empty prompt → error result."""
    from bumblebee_mcp.gemini_tools import smart_create_issue
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await smart_create_issue(clean_db, ctx, {})
    assert result["status"] == "error"
    assert "missing" in result["summary"].lower()


@pytest.mark.asyncio
async def test_smart_create_issue_handles_non_json_gemini_response(
    clean_db, seed_workspace_id, monkeypatch,
):
    """When Gemini returns garbage, we return a structured error."""
    async def fake(self, prompt, max_tokens=4096):
        return LLMResponse(
            text="not json at all — Gemini hallucinated prose",
            finish_reason="stop", tokens_in=10, tokens_out=20, model="gemini-stub",
        )
    import bumblebee.services.execution.llm_provider as mod
    monkeypatch.setattr(mod.GeminiProvider, "invoke", fake)

    from bumblebee_mcp.gemini_tools import smart_create_issue
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await smart_create_issue(clean_db, ctx, {"prompt": "whatever"})
    assert result["status"] == "error"
    assert "non-JSON" in result["summary"]


@pytest.mark.asyncio
async def test_ask_workspace_returns_grounded_answer(
    clean_db, seed_workspace_id, stub_gemini,
):
    """Q&A retrieves issues+events and feeds to Gemini, returns answer."""
    from bumblebee_mcp.gemini_tools import ask_workspace
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await ask_workspace(
        clean_db, ctx,
        {"question": "what's the status of OAuth work?"},
    )
    assert result["status"] == "success"
    assert "BB-1" in result["summary"]
    assert "model" in result["data"]
    assert result["data"]["context_issues"] >= 0


@pytest.mark.asyncio
async def test_ask_workspace_missing_question_errors(clean_db, seed_workspace_id):
    from bumblebee_mcp.gemini_tools import ask_workspace
    ctx = _ctx(seed_workspace_id, WorkspaceRole.MEMBER)
    result = await ask_workspace(clean_db, ctx, {})
    assert result["status"] == "error"


@pytest.mark.asyncio
async def test_gemini_tools_registered_in_mcp_catalog():
    """Both Gemini tools must appear in the dispatch catalog."""
    from bumblebee_mcp.tools import TOOLS_BY_NAME
    assert "bumblebee_smart_create_issue" in TOOLS_BY_NAME
    assert "bumblebee_ask" in TOOLS_BY_NAME


@pytest.mark.asyncio
async def test_gemini_tools_have_proper_input_schemas():
    from bumblebee_mcp.tools import TOOLS_BY_NAME
    smart = TOOLS_BY_NAME["bumblebee_smart_create_issue"]
    assert smart.input_schema["required"] == ["prompt"]
    assert "commit" in smart.input_schema["properties"]
    ask = TOOLS_BY_NAME["bumblebee_ask"]
    assert ask.input_schema["required"] == ["question"]
