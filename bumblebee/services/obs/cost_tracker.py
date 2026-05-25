"""CostTracker: real-time aggregation. Plane 7."""
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.models.issue import Issue


async def session_total(db: AsyncSession, session_id: uuid.UUID) -> dict:
    session = await db.get(AgentSession, session_id)
    if not session:
        return {"tokens_in": 0, "tokens_out": 0, "dollars": 0.0}
    return {
        "tokens_in": session.tokens_in,
        "tokens_out": session.tokens_out,
        "dollars": session.dollars_used,
    }


async def issue_total(db: AsyncSession, issue_id: uuid.UUID) -> dict:
    stmt = select(
        func.coalesce(func.sum(AgentSession.tokens_in), 0),
        func.coalesce(func.sum(AgentSession.tokens_out), 0),
        func.coalesce(func.sum(AgentSession.dollars_used), 0),
    ).where(AgentSession.issue_id == issue_id)
    row = (await db.execute(stmt)).one()
    return {"tokens_in": int(row[0]), "tokens_out": int(row[1]), "dollars": float(row[2])}


async def project_daily(db: AsyncSession, project_id: uuid.UUID) -> dict:
    """Sum sessions linked to issues of project in last 24h."""
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    stmt = (
        select(
            func.coalesce(func.sum(AgentSession.tokens_in), 0),
            func.coalesce(func.sum(AgentSession.tokens_out), 0),
            func.coalesce(func.sum(AgentSession.dollars_used), 0),
        )
        .join(Issue, Issue.id == AgentSession.issue_id)
        .where(Issue.project_id == project_id, AgentSession.created_at >= cutoff)
    )
    row = (await db.execute(stmt)).one()
    return {"tokens_in": int(row[0]), "tokens_out": int(row[1]), "dollars": float(row[2])}
