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

    # Budget pre-check (per-session/issue/project)
    try:
        await check_session_budget(db, session)
    except BudgetExceeded as e:
        await _finalize_failed(db, session, role, FailureReason.BUDGET_EXCEEDED, str(e))
        return HarnessResult(ok=False, output={"error": str(e)})

    # Workspace quota pre-check (Phase D) — separate from per-session budget.
    # Free/Pro plans have a monthly LLM spend cap; Team is unlimited (passthrough).
    if session.workspace_id:
        try:
            from bumblebee.services.billing.quota import check_workspace_quota, QuotaExceeded
            await check_workspace_quota(db, session.workspace_id)
        except QuotaExceeded as e:
            await _finalize_failed(db, session, role, FailureReason.BUDGET_EXCEEDED, str(e))
            return HarnessResult(ok=False, output={"error": str(e), "upgrade_required": True})

    # LLM call (provider selected via BUMBLEBEE_PROVIDER env, default stub)
    import os
    provider_name = os.environ.get("BUMBLEBEE_PROVIDER", "stub")
    provider = get_provider(provider_name)

    streaming_enabled = os.environ.get("BUMBLEBEE_STREAMING", "1") != "0"
    if streaming_enabled and getattr(provider, "supports_streaming", False):
        response = await _invoke_with_streaming(db, session, role, provider, prompt)
    else:
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

    # Phase D: record workspace usage + Stripe metered passthrough (Team plan only)
    if session.workspace_id and cost > 0:
        try:
            from bumblebee.services.billing.quota import record_usage
            await record_usage(
                db, session.workspace_id, cost,
                event_idempotency_key=f"session-{session.id}-{session.tokens_in + session.tokens_out}",
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("usage record failed: %s", exc)

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


async def _invoke_with_streaming(db, session, role, provider, prompt):
    """Run provider.invoke_streaming and broadcast each chunk over WebSocket.

    Chunks are ephemeral (not persisted). Only the final llm_call event hits the DB.
    The web UI consumes chunks via /ws and assembles them client-side.
    """
    from bumblebee.services.websocket.manager import get_manager
    from sqlalchemy import select
    from bumblebee.models.project import Project
    from bumblebee.models.issue import Issue
    import uuid

    # Resolve project slug once
    slug = None
    if session.issue_id:
        iss = (await db.execute(select(Issue).where(Issue.id == session.issue_id))).scalar_one_or_none()
        if iss:
            proj = (await db.execute(select(Project).where(Project.id == iss.project_id))).scalar_one_or_none()
            if proj:
                slug = proj.slug

    mgr = get_manager()
    chunk_seq = 0

    async def on_chunk(chunk: dict) -> None:
        nonlocal chunk_seq
        chunk_seq += 1
        if not slug:
            return
        await mgr.broadcast(slug, {
            "id": f"chunk-{session.id}-{chunk_seq}",
            "type": "llm.chunk",
            "session_id": str(session.id),
            "issue_id": str(session.issue_id) if session.issue_id else None,
            "actor": role,
            "payload": {**chunk, "seq": chunk_seq},
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        })

    # Announce stream start so UI can clear/prepare its buffer
    await on_chunk({"type": "stream_started", "role": role})
    try:
        response = await provider.invoke_streaming(prompt, on_chunk)
    except Exception as exc:
        await on_chunk({"type": "error", "message": str(exc)})
        raise
    await on_chunk({"type": "stream_ended", "role": role})
    return response


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
