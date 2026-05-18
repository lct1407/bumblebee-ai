"""Harness: bb-owned wrapper around LLM provider. Plane 3 / Execution.

Phase 1 stub: emits structured events; real claude-cli invocation deferred.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.agent_session import AgentSession, SessionStatus
from src.services.state.event_log import append_event
from src.services.safety.budget_enforcer import estimate_cost


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
    input_state: dict,
) -> HarnessResult:
    """
    Phase 1 stub: simulates a role execution.

    Real implementation (Phase 1.5+):
        - Context Assembler builds prompt from system + tools + IssueMemory + scope
        - Spawns claude-cli subprocess (or HTTP to Anthropic)
        - Pipes stdout → emit llm_call + tool_call events
        - Returns when done OR budget hit OR loop detected
    """
    # Mark session running
    session.status = SessionStatus.RUNNING
    session.started_at = datetime.now(timezone.utc)
    session.role = role
    await db.flush()

    await append_event(
        db,
        type="session_started",
        session_id=session.id,
        issue_id=session.issue_id,
        payload={"role": role, "input": input_state},
        source="agent",
        actor=role,
    )

    # Stub: per-role canned outputs (replace with real LLM call in Phase 1.5)
    role_outputs = {
        "triager": {
            "complexity": "simple",
            "summary": "Stub triage: small fix",
            "ai_confidence": 0.85,
        },
        "coordinator": {
            "plan_summary": "Stub plan: 1 subtask",
            "sub_tasks": [{"role": "implementer", "scope": ["src/**"]}],
        },
        "implementer": {
            "files_changed": ["stub.py"],
            "commit_sha": "stub" + str(uuid.uuid4())[:7],
        },
        "tester": {"tests_run": 0, "passed": 0, "failed": 0, "verdict": "skip_stub"},
        "reviewer": {"verdict": "approve", "comments": []},
        "assistant": {"reply": "Hello from stub assistant"},
    }
    output = role_outputs.get(role, {"status": "unknown_role"})

    # Stub token usage
    tokens_in = 1000
    tokens_out = 200
    cost = estimate_cost(tokens_in, tokens_out)

    session.tokens_in += tokens_in
    session.tokens_out += tokens_out
    session.dollars_used += cost

    await append_event(
        db,
        type="llm_call",
        session_id=session.id,
        issue_id=session.issue_id,
        payload={
            "model": "stub",
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost,
        },
        source="agent",
    )
    await append_event(
        db,
        type="cost_charged",
        session_id=session.id,
        issue_id=session.issue_id,
        payload={"amount_usd": cost, "cumulative_usd": session.dollars_used},
        source="system",
    )

    # Mark complete
    session.status = SessionStatus.COMPLETED
    session.completed_at = datetime.now(timezone.utc)
    await append_event(
        db,
        type="session_completed",
        session_id=session.id,
        issue_id=session.issue_id,
        payload={"output": output},
        source="agent",
        actor=role,
    )

    return HarnessResult(ok=True, output=output, tokens_in=tokens_in, tokens_out=tokens_out)
