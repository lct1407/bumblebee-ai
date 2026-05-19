"""Test ToolExecutor + handlers — Phase 1."""
import pytest
from sqlalchemy import select

from bumblebee.models.agent_session import AgentSession
from bumblebee.models.issue import Issue
from bumblebee.services.tool.executor import get_executor
from bumblebee.services.tool.result import ToolResult


@pytest.mark.asyncio
async def test_executor_validates_schema(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    sess = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(sess)
    await db.flush()

    ex = get_executor()
    # missing required field
    result = await ex.execute("create_issue", {"title": "x"}, sess, db)
    assert result.status == "error"
    assert "missing_field" in result.summary


@pytest.mark.asyncio
async def test_executor_unknown_tool(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    sess = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(sess)
    await db.flush()
    ex = get_executor()
    result = await ex.execute("does_not_exist", {}, sess, db)
    assert result.status == "error"
    assert "unknown_tool" in result.summary or "validation_failed" in result.summary


@pytest.mark.asyncio
async def test_handler_list_issues(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    sess = AgentSession(role="triager", provider="stub", issue_id=issue.id)
    db.add(sess)
    await db.flush()
    ex = get_executor()
    result = await ex.execute("list_issues", {"project_slug": "bb"}, sess, db)
    assert result.status == "success"
    assert "issues" in result.data
    assert len(result.data["issues"]) >= 3  # seeded BB-1, BB-2, BB-3


@pytest.mark.asyncio
async def test_handler_scratch_roundtrip(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    sess = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(sess)
    await db.flush()
    ex = get_executor()
    # write
    r = await ex.execute(
        "scratch_write",
        {"key": "plan_progress", "value": {"step": 3}},
        sess, db,
    )
    assert r.status == "success"
    # read
    r2 = await ex.execute("scratch_read", {"key": "plan_progress"}, sess, db)
    assert r2.status == "success"
    assert r2.data["value"] == {"step": 3}


@pytest.mark.asyncio
async def test_handler_suggest_issue_persists_draft(clean_db):
    db = clean_db
    from bumblebee.models.chat_session import ChatSession
    from bumblebee.models.project import Project

    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    chat = ChatSession(title="t", project_id=proj.id, messages=[])
    db.add(chat)
    await db.flush()
    sess = AgentSession(role="assistant", provider="stub", chat_session_id=chat.id)
    db.add(sess)
    await db.flush()

    ex = get_executor()
    r = await ex.execute(
        "suggest_issue",
        {"draft": {"title": "fix bug", "type": "bug"}},
        sess, db,
    )
    assert r.status == "success"
    assert "Awaiting" in r.summary
    # verify draft persisted in chat metadata
    await db.refresh(chat)
    pending = chat.chat_metadata.get("pending_suggestions", [])
    assert len(pending) == 1
    assert pending[0]["kind"] == "issue"


def test_tool_result_helpers():
    r = ToolResult.ok("done")
    assert r.status == "success"
    r2 = ToolResult.err("oops", next_actions=["retry"])
    assert r2.status == "error"
    assert r2.next_actions == ["retry"]
