"""Trigger workflow run for an issue + view runs."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from bumblebee.database import get_db
from bumblebee.models.issue import Issue
from bumblebee.models.project import Project
from bumblebee.models.workflow import Workflow
from bumblebee.models.workflow_run import WorkflowRun, RunStatus
from bumblebee.models.agent_session import AgentSession, SessionStatus
from bumblebee.services.state.event_log import append_event
from bumblebee.services.control.orchestrator import execute_workflow_run
from bumblebee.services.control.workflow_selector import select_workflow_name
from bumblebee.services.safety.approval_gate import check_dispatch_allowed

router = APIRouter(prefix="/api/workflow-runs", tags=["workflows"])


class TriggerRequest(BaseModel):
    issue_id: uuid.UUID
    workflow_name: str | None = None  # default workflow if None


class TriggerResponse(BaseModel):
    workflow_run_id: uuid.UUID
    workflow_name: str
    status: str


@router.post("/trigger", response_model=TriggerResponse)
async def trigger_workflow(req: TriggerRequest, db: AsyncSession = Depends(get_db)):
    """
    Trigger a workflow run for an issue. Phase 1 implementation:
    creates a WorkflowRun row + AgentSession for the Triager role + runs stub harness.
    Full LangGraph orchestration is in Phase 4 (Coordinator).
    """
    issue = await db.get(Issue, req.issue_id)
    if not issue:
        raise HTTPException(404, "issue_not_found")

    project = await db.get(Project, issue.project_id)

    # H2: Approval gate (simple+auto-policy bypass, others require APPROVED status)
    decision = check_dispatch_allowed(issue, project)
    if not decision.allowed:
        raise HTTPException(409, {"reason": decision.reason, "issue_status": issue.status.value})

    # Relation gate: block dispatch if blocked_by-open
    from bumblebee.services.issue_links import is_blocked_by_open
    blockers = await is_blocked_by_open(db, issue.id)
    if blockers:
        raise HTTPException(409, {
            "reason": "blocked_by_open_issue",
            "blockers": [
                {"id": str(b.id), "number": b.number, "title": b.title, "status": b.status.value}
                for b in blockers
            ],
        })

    # H1: Complexity → workflow auto-router. Explicit workflow_name still wins.
    name = req.workflow_name or select_workflow_name(issue, project)
    workflow = (
        await db.execute(select(Workflow).where(Workflow.name == name, Workflow.is_active == True))
    ).scalar_one_or_none()
    if not workflow:
        raise HTTPException(404, f"workflow_not_found: {name}")

    run = WorkflowRun(
        workflow_id=workflow.id,
        issue_id=issue.id,
        status=RunStatus.RUNNING,
        current_node=workflow.graph.get("nodes", [{}])[0].get("id", "start"),
        started_at=datetime.now(timezone.utc),
        langgraph_thread_id=str(uuid.uuid4()),
    )
    db.add(run)
    await db.flush()

    await append_event(
        db,
        type="workflow_started",
        issue_id=issue.id,
        project_id=issue.project_id,
        workflow_run_id=run.id,
        payload={"workflow_name": name},
        source="system",
    )

    # Full multi-node LangGraph traversal via orchestrator (Phase 1.5)
    try:
        await execute_workflow_run(db, workflow, issue, run)
    except Exception as e:
        await db.commit()
        raise HTTPException(500, f"workflow_execution_failed: {str(e)[:200]}")

    await db.commit()
    return TriggerResponse(workflow_run_id=run.id, workflow_name=name, status=run.status.value)


@router.get("/{run_id}")
async def get_run(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    run = await db.get(WorkflowRun, run_id)
    if not run:
        raise HTTPException(404, "run_not_found")
    return {
        "id": run.id,
        "status": run.status.value,
        "current_node": run.current_node,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "issue_id": run.issue_id,
        "workflow_id": run.workflow_id,
    }


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Interactive: user clicks Stop. Marks run + all RUNNING sessions as cancelled.

    Workers polling task_queue will see the cancelled state on next claim attempt
    or via lease expiry; LangGraph itself doesn't have hard kill (cooperative).
    """
    run = await db.get(WorkflowRun, run_id)
    if not run:
        raise HTTPException(404, "run_not_found")
    if run.status in (RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELED):
        return {"id": run.id, "status": run.status.value, "noop": True}
    run.status = RunStatus.CANCELED
    run.completed_at = datetime.now(timezone.utc)
    # Cancel any in-flight sessions
    sessions = (
        await db.execute(
            select(AgentSession).where(
                AgentSession.workflow_run_id == run_id,
                AgentSession.status == SessionStatus.RUNNING,
            )
        )
    ).scalars().all()
    for s in sessions:
        s.status = SessionStatus.CANCELED
        s.completed_at = datetime.now(timezone.utc)
    # Cancel any queued tasks for this run
    from sqlalchemy import text as sqltext
    await db.execute(
        sqltext("UPDATE task_queue SET status='cancelled', updated_at=NOW() "
                "WHERE workflow_run_id=:rid AND status IN ('queued','claimed')"),
        {"rid": run_id},
    )
    await append_event(
        db, type="workflow_cancelled", issue_id=run.issue_id,
        workflow_run_id=run.id, source="user",
        payload={"sessions_cancelled": len(sessions)},
    )
    await db.commit()
    return {"id": run.id, "status": run.status.value, "sessions_cancelled": len(sessions)}


@router.post("/{run_id}/message")
async def send_message(
    run_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Interactive: user sends a hint/correction to a running session.

    Stored as event `user_intervention` — agent reads on next iteration if it
    polls events (Phase J — currently events stored, agent code may not consume).
    """
    run = await db.get(WorkflowRun, run_id)
    if not run:
        raise HTTPException(404, "run_not_found")
    await append_event(
        db, type="user_intervention", issue_id=run.issue_id,
        workflow_run_id=run.id, source="user",
        payload={"message": (body.get("message") or "")[:2000]},
    )
    await db.commit()
    return {"ok": True}
