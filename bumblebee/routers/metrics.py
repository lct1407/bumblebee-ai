"""Prometheus-style metrics endpoint — BB-9.

Plain-text exposition; no external dep. Counters captured in process memory.
"""
from __future__ import annotations
from collections import defaultdict
from time import time

from fastapi import APIRouter, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from bumblebee.database import get_db
from bumblebee.models.issue import Issue, IssueStatus
from bumblebee.models.workflow_run import WorkflowRun, RunStatus
from bumblebee.models.agent_node import AgentNode, NodeStatus

router = APIRouter(tags=["metrics"])

# In-process counters (reset on restart). Push to Prometheus pull endpoint.
_counters: dict[str, int] = defaultdict(int)
_start_ts = time()


def inc(name: str, by: int = 1) -> None:
    _counters[name] += by


@router.get("/metrics")
async def metrics(db: AsyncSession = Depends(get_db)) -> Response:
    """Plain-text Prometheus exposition."""
    lines: list[str] = [
        "# HELP bb_uptime_seconds Process uptime",
        "# TYPE bb_uptime_seconds gauge",
        f"bb_uptime_seconds {int(time() - _start_ts)}",
    ]

    # Issues by status
    rows = (
        await db.execute(
            select(Issue.status, func.count(Issue.id)).group_by(Issue.status)
        )
    ).all()
    lines.append("# HELP bb_issues Issue count by status")
    lines.append("# TYPE bb_issues gauge")
    for status, n in rows:
        lines.append(f'bb_issues{{status="{status.value}"}} {n}')

    # Workflow runs by status
    rows = (
        await db.execute(
            select(WorkflowRun.status, func.count(WorkflowRun.id)).group_by(WorkflowRun.status)
        )
    ).all()
    lines.append("# HELP bb_workflow_runs Workflow run count by status")
    lines.append("# TYPE bb_workflow_runs gauge")
    for status, n in rows:
        lines.append(f'bb_workflow_runs{{status="{status.value}"}} {n}')

    # Active agent nodes
    rows = (
        await db.execute(
            select(AgentNode.status, func.count(AgentNode.id)).group_by(AgentNode.status)
        )
    ).all()
    lines.append("# HELP bb_agent_nodes Agent node count by status")
    lines.append("# TYPE bb_agent_nodes gauge")
    for status, n in rows:
        lines.append(f'bb_agent_nodes{{status="{status.value}"}} {n}')

    # In-process counters
    if _counters:
        lines.append("# HELP bb_counter In-process counters")
        lines.append("# TYPE bb_counter counter")
        for name, v in _counters.items():
            lines.append(f'bb_counter{{name="{name}"}} {v}')

    return Response("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")
