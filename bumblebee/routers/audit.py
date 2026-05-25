"""Audit log endpoints — filtered query + CSV streaming export.

The events table already captures every meaningful action (status changes, LLM
calls, scope leases, etc.). This router surfaces that data for compliance use:

  GET  /api/audit/events.json   — filtered JSON (cursor-paginated)
  GET  /api/audit/events.csv    — streaming CSV export

Workspace-scoped via require_workspace; only members with READ_AUDIT_LOG can list,
EXPORT_AUDIT_LOG to download CSV.
"""
from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.event import Event
from bumblebee.services.rbac import (
    CurrentWorkspace,
    Permission,
    require_permission,
)

router = APIRouter(prefix="/api/audit", tags=["audit"])


def _coerce_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _serialize(e: Event) -> dict:
    return {
        "id": str(e.id),
        "type": e.type,
        "source": e.source,
        "actor": e.actor,
        "issue_id": str(e.issue_id) if e.issue_id else None,
        "session_id": str(e.session_id) if e.session_id else None,
        "project_id": str(e.project_id) if e.project_id else None,
        "payload": e.payload or {},
        "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
    }


@router.get("/events.json")
async def query_events(
    ws: CurrentWorkspace = Depends(require_permission(Permission.READ_AUDIT_LOG)),
    db: AsyncSession = Depends(get_db),
    actor: str | None = Query(None, description="Filter by actor name (e.g. 'implementer')"),
    type: str | None = Query(None, description="Filter by event type"),
    issue_id: uuid.UUID | None = Query(None),
    session_id: uuid.UUID | None = Query(None),
    source: str | None = Query(None, description="user / agent / system"),
    since: str | None = Query(None, description="ISO timestamp lower bound"),
    until: str | None = Query(None, description="ISO timestamp upper bound"),
    cursor: str | None = Query(None, description="Pagination cursor (event id)"),
    limit: int = Query(50, ge=1, le=200),
):
    """Filtered audit log query, workspace-scoped, cursor-paginated (newest first)."""
    stmt = (
        select(Event)
        .where(Event.workspace_id == ws.workspace_id)
        .order_by(desc(Event.occurred_at), desc(Event.id))
        .limit(limit + 1)  # over-fetch by 1 to compute has_more
    )
    if actor:
        stmt = stmt.where(Event.actor == actor)
    if type:
        stmt = stmt.where(Event.type == type)
    if issue_id:
        stmt = stmt.where(Event.issue_id == issue_id)
    if session_id:
        stmt = stmt.where(Event.session_id == session_id)
    if source:
        stmt = stmt.where(Event.source == source)
    if (dt := _coerce_dt(since)):
        stmt = stmt.where(Event.occurred_at >= dt)
    if (dt := _coerce_dt(until)):
        stmt = stmt.where(Event.occurred_at <= dt)
    if cursor:
        try:
            cur_id = uuid.UUID(cursor)
            anchor = await db.get(Event, cur_id)
            if anchor:
                stmt = stmt.where(Event.occurred_at < anchor.occurred_at)
        except (ValueError, TypeError):
            pass

    rows = list((await db.execute(stmt)).scalars().all())
    has_more = len(rows) > limit
    page = rows[:limit]

    return {
        "events": [_serialize(e) for e in page],
        "count": len(page),
        "next_cursor": str(page[-1].id) if (has_more and page) else None,
        "has_more": has_more,
    }


@router.get("/events.csv")
async def export_csv(
    ws: CurrentWorkspace = Depends(require_permission(Permission.EXPORT_AUDIT_LOG)),
    db: AsyncSession = Depends(get_db),
    actor: str | None = Query(None),
    type: str | None = Query(None),
    issue_id: uuid.UUID | None = Query(None),
    source: str | None = Query(None),
    since: str | None = Query(None),
    until: str | None = Query(None),
    max_rows: int = Query(50_000, le=1_000_000),
):
    """Stream CSV of filtered audit events. Memory-bounded via server-side cursor."""
    stmt = (
        select(Event)
        .where(Event.workspace_id == ws.workspace_id)
        .order_by(desc(Event.occurred_at))
        .limit(max_rows)
    )
    if actor: stmt = stmt.where(Event.actor == actor)
    if type: stmt = stmt.where(Event.type == type)
    if issue_id: stmt = stmt.where(Event.issue_id == issue_id)
    if source: stmt = stmt.where(Event.source == source)
    if (dt := _coerce_dt(since)): stmt = stmt.where(Event.occurred_at >= dt)
    if (dt := _coerce_dt(until)): stmt = stmt.where(Event.occurred_at <= dt)

    async def gen():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "occurred_at", "type", "source", "actor", "issue_id", "session_id", "payload_json"])
        yield buf.getvalue()
        buf.seek(0); buf.truncate(0)

        # Stream chunks rather than materializing the entire list
        result = await db.stream(stmt)
        import json
        async for row in result:
            e = row[0] if isinstance(row, tuple) else row
            writer.writerow([
                str(e.id),
                e.occurred_at.isoformat() if e.occurred_at else "",
                e.type,
                e.source or "",
                e.actor or "",
                str(e.issue_id) if e.issue_id else "",
                str(e.session_id) if e.session_id else "",
                json.dumps(e.payload or {}, default=str),
            ])
            yield buf.getvalue()
            buf.seek(0); buf.truncate(0)

    filename = f"bumblebee-audit-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        gen(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
