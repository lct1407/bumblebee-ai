"""Trigger workflow run for an issue + view runs."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from src.database import get_db
from src.models.issue import Issue
from src.models.workflow import Workflow
from src.models.workflow_run import WorkflowRun, RunStatus
from src.models.agent_session import AgentSession, SessionStatus
from src.services.state.event_log import append_event
from src.services.execution.harness import run_role

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

    # Pick default workflow
    name = req.workflow_name or "simple-fix-flow"
    workflow = (
        await db.execute(select(Workflow).where(Workflow.name == name, Workflow.is_active == True))
    ).scalar_one_or_none()
    if not workflow:
        raise HTTPException(404, f"workflow_not_found: {name}")

    run = WorkflowRun(
        workflow_id=workflow.id,
        issue_id=issue.id,
        status=RunStatus.RUNNING,
        current_node="triage",
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

    # Create + execute first stub session (triager)
    session = AgentSession(
        role="triager",
        phase="triage",
        provider="stub",
        issue_id=issue.id,
        workflow_run_id=run.id,
        budget_wall_min=60,
        budget_tokens_max=160_000,
        budget_dollars_max=3.0,
    )
    db.add(session)
    await db.flush()

    result = await run_role(db, session=session, role="triager", input_state={
        "issue_id": str(issue.id),
        "title": issue.title,
        "description": issue.description,
    })

    # Project triage output back onto issue
    if result.ok:
        out = result.output
        if "complexity" in out:
            issue.complexity = out["complexity"]
        if "ai_confidence" in out:
            issue.ai_confidence = out["ai_confidence"]
        if "summary" in out:
            issue.ai_summary = out["summary"]

    run.current_node = "done"
    run.status = RunStatus.COMPLETED
    run.completed_at = datetime.now(timezone.utc)

    await append_event(
        db,
        type="workflow_completed",
        issue_id=issue.id,
        project_id=issue.project_id,
        workflow_run_id=run.id,
        payload={"final_status": run.status.value},
        source="system",
    )

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
