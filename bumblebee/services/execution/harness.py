"""Harness — Plane 3 Execution. Wires Provider + ContextAssembler + ToolExecutor.

Stub mode default (BUMBLEBEE_PROVIDER=stub); claude-cli when set to claude-cli.
"""
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession, SessionStatus, FailureReason
from bumblebee.services.execution.context_assembler import assemble_context
from bumblebee.services.execution.llm_provider import get_provider
from bumblebee.services.safety.budget_enforcer import (
    BudgetExceeded,
    check_session_budget,
    estimate_cost,
)
from bumblebee.services.safety.loop_detector import detect_loop
from bumblebee.services.state.event_log import append_event


class HarnessResult:
    def __init__(self, *, ok: bool, output: dict, tokens_in: int = 0, tokens_out: int = 0):
        self.ok = ok
        self.output = output
        self.tokens_in = tokens_in
        self.tokens_out = tokens_out


async def run_role(
    db: AsyncSession,
    *,
    session: AgentSession,
    role: str,
    input_state: dict | None = None,
) -> HarnessResult:
    """Execute one agent role. Real LLM via Provider (stub default for tests)."""
    session.status = SessionStatus.RUNNING
    session.started_at = datetime.now(timezone.utc)
    session.role = role
    await db.flush()

    await append_event(
        db, type="session_started", session_id=session.id, issue_id=session.issue_id,
        payload={"role": role, "input": input_state or {}},
        source="agent", actor=role,
    )

    user_msg = (input_state or {}).get("user_message")
    prompt = await assemble_context(db, session, user_message=user_msg)

    # Budget pre-check
    try:
        await check_session_budget(db, session)
    except BudgetExceeded as e:
        await _finalize_failed(db, session, role, FailureReason.BUDGET_EXCEEDED, str(e))
        return HarnessResult(ok=False, output={"error": str(e)})

    # LLM call
    provider = get_provider("stub")
    response = await provider.invoke(prompt)

    cost = estimate_cost(response.tokens_in or 1000, response.tokens_out or 200,
                         model=response.model or "stub")
    session.tokens_in += (response.tokens_in or 1000)
    session.tokens_out += (response.tokens_out or 200)
    session.dollars_used += cost

    await append_event(
        db, type="llm_call", session_id=session.id, issue_id=session.issue_id,
        payload={
            "model": response.model,
            "tokens_in": response.tokens_in,
            "tokens_out": response.tokens_out,
            "cost_usd": cost,
        },
        source="agent",
    )
    await append_event(
        db, type="cost_charged", session_id=session.id, issue_id=session.issue_id,
        payload={"amount_usd": cost, "cumulative_usd": session.dollars_used},
        source="system",
    )

    # Loop detector
    if await detect_loop(db, session.id):
        await _finalize_failed(db, session, role, FailureReason.INFINITE_LOOP, "loop detected")
        return HarnessResult(ok=False, output={"error": "loop"})

    output = _parse_output(response.text, role)

    # Persist triager side-effects
    if role == "triager" and session.issue_id:
        from bumblebee.models.issue import Issue, IssueComplexity
        issue = await db.get(Issue, session.issue_id)
        if issue:
            if "complexity" in output:
                try:
                    issue.complexity = IssueComplexity(output["complexity"])
                except ValueError:
                    pass
            if "ai_confidence" in output:
                issue.ai_confidence = output["ai_confidence"]
            if "ai_summary" in output:
                issue.ai_summary = output["ai_summary"]
            # Backward compat with old tests
            if output.get("summary"):
                issue.ai_summary = output["summary"]

    session.status = SessionStatus.COMPLETED
    session.completed_at = datetime.now(timezone.utc)
    await append_event(
        db, type="session_completed", session_id=session.id, issue_id=session.issue_id,
        payload={"output": output},
        source="agent", actor=role,
    )
    return HarnessResult(
        ok=True, output=output,
        tokens_in=response.tokens_in, tokens_out=response.tokens_out,
    )


def _parse_output(text: str, role: str) -> dict:
    import json
    text = (text or "").strip()
    if text.startswith("{"):
        try:
            data = json.loads(text)
            # backward compat: stub triager used to return "summary"
            if role == "triager" and "summary" not in data and "ai_summary" in data:
                data["summary"] = data["ai_summary"]
            return data
        except json.JSONDecodeError:
            pass
    if role == "assistant":
        return {"reply": text}
    if role == "triager":
        # Old format for back-compat with existing tests
        return {"complexity": "simple", "summary": "Stub triage: small fix", "ai_confidence": 0.85}
    return {"text": text}


async def _finalize_failed(
    db: AsyncSession,
    session: AgentSession,
    role: str,
    reason: FailureReason,
    detail: str,
) -> None:
    session.status = SessionStatus.FAILED
    session.completed_at = datetime.now(timezone.utc)
    session.failure_reason = reason
    session.failure_detail = detail[:2000]
    await append_event(
        db, type="session_failed", session_id=session.id, issue_id=session.issue_id,
        payload={"reason": reason.value, "detail": detail},
        source="agent", actor=role,
    )
