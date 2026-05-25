"""Task claim + report endpoints — Phase G worker daemon contract.

The daemon authenticates with `Authorization: Bearer <node_token>` and:
  - POST /api/tasks/claim     -> claim the next runnable task (SKIP LOCKED via task_queue)
  - POST /api/tasks/{id}/report -> stream events / final result back to server
  - POST /api/tasks/{id}/ack   -> mark task succeeded
  - POST /api/tasks/{id}/fail  -> mark task failed (with reason)
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.routers.devices import _node_from_token
from bumblebee.services.dispatch.task_queue import claim_next
from bumblebee.services.state.event_log import append_event

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class ClaimRequest(BaseModel):
    capabilities: list[str] = []  # claim only tasks matching one of these
    lease_seconds: int = 600


class ClaimedTask(BaseModel):
    task_id: uuid.UUID
    issue_id: uuid.UUID | None
    workflow_run_id: uuid.UUID | None
    payload: dict
    lease_expires_at: datetime


class ReportEvent(BaseModel):
    type: str
    payload: dict = {}
    issue_id: uuid.UUID | None = None


@router.post("/claim")
async def claim_task(
    body: ClaimRequest,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> ClaimedTask | None:
    """Claim the next task for this node.

    Returns 204 No Content if no task available so the daemon can long-poll.
    """
    node = await _node_from_token(db, authorization)
    node.last_heartbeat_at = datetime.now(UTC)
    await db.commit()

    # BB-18: pass node's project bindings so claim filters by required_project_id
    bound = node.bound_project_ids or []

    # Try each advertised capability as required_provider in priority order
    for cap in (body.capabilities or [None]):
        task = await claim_next(
            db,
            claimed_by=f"node:{node.id}",
            required_provider=cap,
            bound_project_ids=bound,
            lease_seconds=body.lease_seconds,
        )
        if task:
            await db.commit()
            # lease_expires_at not always returned by claim_next; pull from DB
            from datetime import timedelta
            lease_exp = datetime.now(UTC) + timedelta(seconds=body.lease_seconds)
            return ClaimedTask(
                task_id=task["id"],
                issue_id=task.get("issue_id"),
                workflow_run_id=task.get("workflow_run_id"),
                payload=task.get("payload", {}),
                lease_expires_at=lease_exp,
            )
    return None  # FastAPI -> 200 null. Client treats null as "nothing to do".


@router.post("/{task_id}/report")
async def report_event(
    task_id: uuid.UUID,
    body: ReportEvent,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Worker streams an event during execution (progress, log, partial output)."""
    node = await _node_from_token(db, authorization)
    await append_event(
        db,
        type=body.type,
        payload=body.payload,
        issue_id=body.issue_id,
        workspace_id=node.workspace_id,
        source=f"node:{node.id}",
        actor=node.name,
    )
    await db.commit()
    return {"ok": True}


@router.post("/{task_id}/ack")
async def ack_task(
    task_id: uuid.UUID,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    await _node_from_token(db, authorization)
    await db.execute(
        text("UPDATE task_queue SET status='succeeded', updated_at=NOW() WHERE id=:id"),
        {"id": task_id},
    )
    await db.commit()
    return {"ok": True}


@router.post("/{task_id}/fail")
async def fail_task(
    task_id: uuid.UUID,
    reason: str = "",
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    await _node_from_token(db, authorization)
    await db.execute(
        text(
            "UPDATE task_queue SET status='failed', updated_at=NOW(), "
            "payload = jsonb_set(payload, '{failure_reason}', to_jsonb(:r::text)) "
            "WHERE id=:id"
        ),
        {"id": task_id, "r": reason},
    )
    await db.commit()
    return {"ok": True}
