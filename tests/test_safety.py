"""Test: BudgetEnforcer + LoopDetector + FailureClassifier."""
import pytest
from sqlalchemy import select

from bumblebee.models.agent_session import AgentSession, FailureReason
from bumblebee.models.issue import Issue
from bumblebee.services.safety.budget_enforcer import (
    BudgetExceeded,
    check_session_budget,
    estimate_cost,
)
from bumblebee.services.safety.failure_classifier import classify_failure, recommend_mitigation
from bumblebee.services.safety.loop_detector import detect_loop
from bumblebee.services.state.event_log import append_event


def test_estimate_cost_known_models():
    cost = estimate_cost(tokens_in=1_000_000, tokens_out=1_000_000, model="claude-sonnet-4-6")
    # 3.0 + 15.0
    assert cost == pytest.approx(18.0, rel=0.01)

    cost2 = estimate_cost(tokens_in=10_000, tokens_out=2_000, model="claude-opus-4-7")
    assert cost2 > 0


@pytest.mark.asyncio
async def test_budget_dollars_caps(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    session = AgentSession(
        role="implementer", provider="stub", issue_id=issue.id,
        budget_dollars_max=1.0, dollars_used=0.5,
    )
    db.add(session)
    await db.flush()

    # OK: 0.5 < 1.0
    await check_session_budget(db, session)

    # Push over
    session.dollars_used = 1.5
    with pytest.raises(BudgetExceeded) as exc:
        await check_session_budget(db, session)
    assert exc.value.scope == "session"
    assert exc.value.kind == "dollars"


@pytest.mark.asyncio
async def test_budget_tokens_caps(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    session = AgentSession(
        role="implementer", provider="stub", issue_id=issue.id,
        budget_tokens_max=1000, tokens_in=600, tokens_out=500,
    )
    db.add(session)
    await db.flush()

    with pytest.raises(BudgetExceeded) as exc:
        await check_session_budget(db, session)
    assert exc.value.kind == "tokens"


def test_failure_classifier_timeout():
    assert classify_failure("Deadline exceeded after 60s") == FailureReason.TIMEOUT
    mit = recommend_mitigation(FailureReason.TIMEOUT)
    assert mit["action"] == "split_into_subagents"


def test_failure_classifier_context():
    assert classify_failure("context length exceeded") == FailureReason.CONTEXT_EXHAUST
    assert classify_failure("max tokens reached") == FailureReason.CONTEXT_EXHAUST


def test_failure_classifier_infra():
    assert classify_failure("connection refused") == FailureReason.INFRA
    assert classify_failure("HTTP 503 service unavailable") == FailureReason.INFRA


def test_failure_classifier_unknown():
    assert classify_failure("some random weird text") == FailureReason.UNKNOWN
    assert classify_failure("") == FailureReason.UNKNOWN


@pytest.mark.asyncio
async def test_loop_detector_no_loop(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    session = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(session)
    await db.flush()

    # Few distinct tool calls â€” no loop
    for tool in ["read_file", "search_code", "run_lint"]:
        await append_event(
            db, type="tool_call", session_id=session.id,
            payload={"tool": tool, "args": {}},
        )
    await db.commit()

    assert (await detect_loop(db, session.id)) is False


@pytest.mark.asyncio
async def test_loop_detector_catches_repeat(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    session = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(session)
    await db.flush()

    # Same tool + same args repeated 3 times
    for _ in range(3):
        await append_event(
            db, type="tool_call", session_id=session.id,
            payload={"tool": "read_file", "args": {"path": "x.py"}},
        )
    await db.commit()

    assert (await detect_loop(db, session.id)) is True
