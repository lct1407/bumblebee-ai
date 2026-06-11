"""Harness — Plane 3 Execution. Session lifecycle around the LangGraph agent loop.

Wires Provider + ContextAssembler + the agent_loop StateGraph:

  1. assemble context (Defense Baseline + role prompt + knowledge + memory)
  2. run the LangGraph agent loop (safety → invoke → tools, bounded cycle)
     — see bumblebee/services/execution/agent_loop.py for the graph
  3. parse final output, persist side-effects, close the session

Stub mode default (BUMBLEBEE_PROVIDER=stub); claude-cli when set to claude-cli.
"""
from __future__ import annotations

import json
import os
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession, FailureReason, SessionStatus
from bumblebee.services.execution.agent_loop import run_agent_loop
from bumblebee.services.execution.context_assembler import assemble_context
from bumblebee.services.execution.llm_provider import get_provider
from bumblebee.services.safety.loop_detector import detect_loop
from bumblebee.services.state.event_log import append_event

DEFAULT_MAX_TOOL_ITERATIONS = 5


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
    """Execute one agent role through the LangGraph agentic loop."""
    session.status = SessionStatus.RUNNING
    session.started_at = datetime.now(UTC)
    session.role = role
    await db.flush()

    await append_event(
        db, type="session_started", session_id=session.id, issue_id=session.issue_id,
        payload={"role": role, "input": input_state or {}},
        source="agent", actor=role,
    )

    user_msg = (input_state or {}).get("user_message")
    prompt = await assemble_context(db, session, user_message=user_msg)

    provider = get_provider(os.environ.get("BUMBLEBEE_PROVIDER", "stub"))
    max_iterations = int(
        os.environ.get("BUMBLEBEE_MAX_TOOL_ITERATIONS", DEFAULT_MAX_TOOL_ITERATIONS)
    )

    state = await run_agent_loop(
        db, session=session, role=role, provider=provider,
        prompt=prompt, max_iterations=max_iterations,
    )

    failure = state.get("failure")
    if failure:
        await _finalize_failed(db, session, role, failure["reason"], failure["detail"])
        output = {"error": _failure_output(failure)}
        output.update(failure.get("extra") or {})
        return HarnessResult(ok=False, output=output)

    # Final loop check: the graph may exit on the iteration cap with the model
    # still requesting the same tool over and over.
    if await detect_loop(db, session.id):
        await _finalize_failed(db, session, role, FailureReason.INFINITE_LOOP, "loop detected")
        return HarnessResult(ok=False, output={"error": "loop"})

    response = state["response"]
    output = _parse_output(response.text, role)

    if role == "triager":
        await _apply_triager_side_effects(db, session, output)

    session.status = SessionStatus.COMPLETED
    session.completed_at = datetime.now(UTC)
    await append_event(
        db, type="session_completed", session_id=session.id, issue_id=session.issue_id,
        payload={"output": output},
        source="agent", actor=role,
    )
    return HarnessResult(
        ok=True, output=output,
        tokens_in=response.tokens_in, tokens_out=response.tokens_out,
    )


def _failure_output(failure: dict) -> str:
    if failure["reason"] == FailureReason.INFINITE_LOOP:
        return "loop"
    return failure["detail"]


def _parse_output(text: str, role: str) -> dict:
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


async def _apply_triager_side_effects(
    db: AsyncSession, session: AgentSession, output: dict
) -> None:
    """Persist triage classification onto the Issue row."""
    if not session.issue_id:
        return
    from bumblebee.models.issue import Issue, IssueComplexity
    issue = await db.get(Issue, session.issue_id)
    if not issue:
        return
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


async def _finalize_failed(
    db: AsyncSession,
    session: AgentSession,
    role: str,
    reason: FailureReason,
    detail: str,
) -> None:
    session.status = SessionStatus.FAILED
    session.completed_at = datetime.now(UTC)
    session.failure_reason = reason
    session.failure_detail = detail[:2000]
    await append_event(
        db, type="session_failed", session_id=session.id, issue_id=session.issue_id,
        payload={"reason": reason.value, "detail": detail},
        source="agent", actor=role,
    )
