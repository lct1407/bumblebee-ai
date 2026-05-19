"""Cross-phase tests: eval (Phase 2), mitigation (Phase 5), notifications + replay (Phase 7)."""
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from bumblebee.eval.runner import load_task, run_eval_sync, run_golden_set
from bumblebee.eval.spec import EvalRunResult, EvalTask, JudgeSpec
from bumblebee.eval.judges import judge_grep, judge_regex_negative, judge_exit_code
from bumblebee.models.agent_session import AgentSession, FailureReason
from bumblebee.models.issue import Issue
from bumblebee.models.notification import Notification
from bumblebee.models.project import Project
from bumblebee.services.notifications.dispatcher import (
    notify_session_completed,
    notify_session_failed,
    notify_budget_warning,
)
from bumblebee.services.obs.replay import diff_replay, replay_session
from bumblebee.services.safety.mitigation_actuator import execute_mitigation
from bumblebee.services.state.event_log import append_event


# ============ Eval (Phase 2) ============

def test_eval_load_task_from_yaml(tmp_path):
    p = tmp_path / "t.yaml"
    p.write_text(
        "name: t\nworkflow: x-flow\njudge:\n  - type: exit_code\n    command: echo ok\nexpected_pass_rate: 1.0\n",
        encoding="utf-8",
    )
    task = load_task(p)
    assert task.name == "t"
    assert task.judge[0].type == "exit_code"


def test_eval_judge_exit_code_pass(tmp_path):
    spec = JudgeSpec(type="exit_code", command="python -c \"import sys;sys.exit(0)\"")
    result = judge_exit_code(spec, str(tmp_path))
    assert result.passed


def test_eval_judge_grep_must_match(tmp_path):
    f = tmp_path / "src.py"
    f.write_text("def hello(): return 42")
    spec = JudgeSpec(type="grep", pattern=r"def hello", files=["src.py"], must_match=True)
    result = judge_grep(spec, str(tmp_path))
    assert result.passed


def test_eval_judge_regex_negative_pass(tmp_path):
    f = tmp_path / "good.py"
    f.write_text("clean code")
    spec = JudgeSpec(type="regex_negative", pattern=r"TODO|FIXME", files=["good.py"])
    result = judge_regex_negative(spec, str(tmp_path))
    assert result.passed


def test_eval_golden_smoke_passes():
    golden = Path(__file__).parent.parent / "bumblebee" / "eval" / "golden"
    if not golden.exists():
        pytest.skip("golden dir missing")
    smoke = golden / "smoke-no-op.yaml"
    if not smoke.exists():
        pytest.skip("smoke yaml missing")
    result = run_eval_sync(smoke, repeats=1)
    assert result.gate_passes


# ============ Mitigation (Phase 5) ============

@pytest.mark.asyncio
async def test_mitigation_routes_per_reason(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    sess = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(sess)
    await db.flush()

    result = await execute_mitigation(db, sess, FailureReason.CONTEXT_EXHAUST, attempts=0)
    assert result["action"] == "compact_and_retry"

    result2 = await execute_mitigation(db, sess, FailureReason.INFRA, attempts=0)
    assert result2["action"] == "backoff_retry"

    result3 = await execute_mitigation(db, sess, FailureReason.BUDGET_EXCEEDED, attempts=0)
    assert result3["action"] == "escalate_human"


@pytest.mark.asyncio
async def test_mitigation_max_cycles_escalates(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    sess = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(sess)
    await db.flush()
    result = await execute_mitigation(
        db, sess, FailureReason.TOOL_ERROR, attempts=5, max_cycles=3
    )
    assert result["action"] == "escalate_human"


# ============ Notifications (Phase 7) ============

@pytest.mark.asyncio
async def test_notification_session_completed(clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    n = await notify_session_completed(
        db, project_id=proj.id, recipient="user1",
        session_id=uuid.uuid4(), summary="all done",
    )
    assert n.type.value == "session_completed"
    assert n.recipient == "user1"
    assert "all done" in (n.body or "")


@pytest.mark.asyncio
async def test_notification_budget_warning(clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    n = await notify_budget_warning(
        db, project_id=proj.id, recipient="user1",
        scope="session", used=2.8, cap=3.0,
    )
    assert n.payload["used"] == 2.8


@pytest.mark.asyncio
async def test_notifications_endpoint_list(client, clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    await notify_session_failed(
        db, project_id=proj.id, recipient="user1",
        session_id=uuid.uuid4(), reason="timeout",
    )
    await db.commit()
    r = await client.get("/api/notifications?unread_only=true")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1


# ============ Replay (Phase 7) ============

@pytest.mark.asyncio
async def test_replay_session_returns_trace(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    sess = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(sess)
    await db.flush()
    await append_event(
        db, type="session_started", session_id=sess.id, issue_id=issue.id,
        payload={"role": "implementer"}, source="agent",
    )
    await append_event(
        db, type="llm_call", session_id=sess.id, issue_id=issue.id,
        payload={"tokens_in": 100, "tokens_out": 20}, source="agent",
    )
    await db.commit()
    trace = await replay_session(db, sess.id)
    assert trace["event_count"] >= 2
    types = [e["type"] for e in trace["trace"]]
    assert "session_started" in types
    assert "llm_call" in types


@pytest.mark.asyncio
async def test_replay_endpoint(client, clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    sess = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(sess)
    await db.flush()
    await append_event(
        db, type="session_started", session_id=sess.id, issue_id=issue.id,
        payload={}, source="agent",
    )
    await db.commit()
    r = await client.get(f"/api/replay/{sess.id}")
    assert r.status_code == 200
    assert r.json()["event_count"] >= 1
