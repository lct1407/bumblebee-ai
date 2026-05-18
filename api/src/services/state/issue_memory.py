"""IssueMemory: materialized projection from event log (Tier 5, plan §4.6)."""
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from src.services.state.event_log import get_events_for_issue


async def project_issue_memory(db: AsyncSession, issue_id: uuid.UUID) -> dict:
    """
    Project the event log for one issue into a 3-part memory view.

    Returns:
        {
            "episodic": [...significant events...],
            "semantic": {classification, plan_summary, approach, scope, ...},
            "working":  {open_sub_tasks, blockers, last_status, active_leases}
        }

    This is read on every new session for the issue (Context Assembler input).
    """
    events = await get_events_for_issue(db, issue_id)

    episodic: list[dict] = []
    semantic: dict = {}
    working: dict = {"open_sub_tasks": [], "blockers": [], "active_leases": []}

    for e in events:
        # Episodic — significant events only
        if e.type in (
            "status_change", "plan_complete", "subtask_complete",
            "decision_taken", "session_completed", "session_failed",
            "lease_acquired", "lease_released",
        ):
            episodic.append({
                "type": e.type,
                "occurred_at": e.occurred_at.isoformat(),
                "payload": e.payload,
                "actor": e.actor,
            })

        # Semantic — derive from specific event types
        if e.type == "plan_complete":
            semantic["plan_summary"] = e.payload.get("plan_summary")
            semantic["sub_tasks"] = e.payload.get("sub_tasks", [])
        if e.type == "decision_taken" and e.payload.get("kind") == "complexity":
            semantic["complexity"] = e.payload.get("value")
        if e.type == "decision_taken" and e.payload.get("kind") == "approach":
            semantic["approach"] = e.payload.get("value")

        # Working — live state
        if e.type == "lease_acquired":
            working["active_leases"].append(e.payload)
        if e.type == "lease_released":
            working["active_leases"] = [
                l for l in working["active_leases"]
                if l.get("lease_id") != e.payload.get("lease_id")
            ]
        if e.type == "status_change":
            working["last_status"] = e.payload.get("to")

    return {"episodic": episodic, "semantic": semantic, "working": working}
