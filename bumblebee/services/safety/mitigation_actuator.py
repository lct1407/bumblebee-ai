"""MitigationActuator — Phase 5. Executes recovery strategy based on FailureReason."""
from __future__ import annotations
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession, FailureReason
from bumblebee.services.safety.failure_classifier import recommend_mitigation
from bumblebee.services.state.event_log import append_event


async def execute_mitigation(
    db: AsyncSession,
    session: AgentSession,
    reason: FailureReason,
    attempts: int = 0,
    max_cycles: int = 3,
) -> dict:
    """Execute the recommended mitigation strategy for a failure.

    Returns dict: {action, attempted_at, next_step}.
    Bounded by max_cycles to prevent infinite mitigation loops.
    """
    if attempts >= max_cycles:
        return await _escalate(db, session, reason, "max_cycles_exceeded")

    strategy = recommend_mitigation(reason)
    action = strategy.get("action", "escalate_human")
    params = strategy.get("params", {})

    await append_event(
        db,
        type="decision_taken",
        session_id=session.id,
        issue_id=session.issue_id,
        payload={
            "kind": "mitigation_executed",
            "reason": reason.value,
            "action": action,
            "attempts": attempts,
            "params": params,
        },
        source="system",
    )

    if action == "retry_with_hint":
        return {"action": "retry_with_hint", "next_step": "create_continuation_session"}
    if action == "compact_and_retry":
        return {"action": "compact_and_retry", "next_step": "force_compaction_then_retry"}
    if action == "split_into_subagents":
        return {"action": "split_into_subagents", "next_step": "retrigger_coordinator"}
    if action == "backoff_retry":
        secs = params.get("backoff_seconds", 30)
        return {"action": "backoff_retry", "next_step": f"sleep_{secs}s_then_retry"}
    if action == "reanchor_and_retry":
        return {"action": "reanchor_and_retry", "next_step": "inject_goal_reanchor_then_retry"}
    if action == "fact_check_and_retry":
        return {"action": "fact_check_and_retry", "next_step": "verify_facts_then_retry"}
    if action == "replan_from_current":
        return {"action": "replan_from_current", "next_step": "retrigger_planner"}
    # default: escalate
    return await _escalate(db, session, reason, "default_escalation")


async def _escalate(
    db: AsyncSession, session: AgentSession, reason: FailureReason, detail: str
) -> dict:
    """Human escalation: emit Notification trigger event."""
    await append_event(
        db,
        type="decision_taken",
        session_id=session.id,
        issue_id=session.issue_id,
        payload={
            "kind": "escalated_to_human",
            "reason": reason.value,
            "detail": detail,
        },
        source="system",
    )
    return {"action": "escalate_human", "next_step": "notification_sent"}
