"""BudgetEnforcer: hard ceilings per session, per issue, per project. Plane 5."""
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession, SessionStatus
from bumblebee.config import get_settings

settings = get_settings()


class BudgetExceeded(Exception):
    """Raised when a budget ceiling is hit. Halts session."""
    def __init__(self, scope: str, kind: str, current: float, limit: float):
        self.scope = scope  # "session" | "issue" | "project"
        self.kind = kind    # "tokens" | "dollars" | "wall_time"
        self.current = current
        self.limit = limit
        super().__init__(f"Budget exceeded: {scope}.{kind} {current:.2f} > {limit:.2f}")


async def check_session_budget(db: AsyncSession, session: AgentSession) -> None:
    """Check session-level budget. Raises BudgetExceeded if any cap hit."""
    if session.budget_dollars_max and session.dollars_used >= session.budget_dollars_max:
        raise BudgetExceeded("session", "dollars", session.dollars_used, session.budget_dollars_max)

    tokens_total = session.tokens_in + session.tokens_out
    if session.budget_tokens_max and tokens_total >= session.budget_tokens_max:
        raise BudgetExceeded("session", "tokens", tokens_total, session.budget_tokens_max)

    if session.started_at and session.budget_wall_min:
        elapsed_min = (datetime.now(timezone.utc) - session.started_at).total_seconds() / 60
        if elapsed_min >= session.budget_wall_min:
            raise BudgetExceeded("session", "wall_time", elapsed_min, session.budget_wall_min)


async def check_issue_budget(
    db: AsyncSession, issue_id: uuid.UUID, max_dollars: float | None = None
) -> None:
    """Check sum of all sessions for an issue."""
    max_dollars = max_dollars or settings.issue_dollars_max
    stmt = select(func.coalesce(func.sum(AgentSession.dollars_used), 0)).where(
        AgentSession.issue_id == issue_id
    )
    total = (await db.execute(stmt)).scalar() or 0.0
    if total >= max_dollars:
        raise BudgetExceeded("issue", "dollars", float(total), max_dollars)


async def check_project_budget(
    db: AsyncSession, project_id: uuid.UUID, max_daily_dollars: float | None = None
) -> None:
    """Check sum of all sessions for a project in last 24h."""
    max_daily_dollars = max_daily_dollars or settings.project_daily_dollars_max
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    stmt = (
        select(func.coalesce(func.sum(AgentSession.dollars_used), 0))
        .join(AgentSession.issue)
        .where(
            AgentSession.created_at >= cutoff,
        )
    )
    # Simplified: join via issue.project_id would need proper join; placeholder
    total = (await db.execute(stmt)).scalar() or 0.0
    if total >= max_daily_dollars:
        raise BudgetExceeded("project", "dollars_daily", float(total), max_daily_dollars)


def estimate_cost(tokens_in: int, tokens_out: int, model: str = "claude-sonnet-4-6") -> float:
    """Approximate cost. Rates per 1M tokens (Claude Sonnet 4.6 baseline)."""
    rates = {
        "claude-sonnet-4-6": (3.0, 15.0),
        "claude-opus-4-7":   (15.0, 75.0),
        "claude-haiku-4-5":  (1.0, 5.0),
        "gpt-4":             (10.0, 30.0),
        "gemini-1.5-pro":    (3.5, 10.5),
    }
    rate_in, rate_out = rates.get(model, (3.0, 15.0))
    return (tokens_in / 1e6) * rate_in + (tokens_out / 1e6) * rate_out
