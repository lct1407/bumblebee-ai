"""Full flow demo: register → plan → execute end-to-end on a simple issue.

Triggers simple-fix-flow which has 3 nodes (triage → implement → test → done).
With BUMBLEBEE_PROVIDER=claude-cli each role makes a real LLM call.
"""
from __future__ import annotations
import asyncio
import os
import sys
import uuid as uuidlib
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import select

load_dotenv()

from bumblebee.database import SessionLocal
from bumblebee.models.event import Event
from bumblebee.models.issue import Issue, IssueStatus
from bumblebee.models.workflow import Workflow
from bumblebee.models.workflow_run import RunStatus, WorkflowRun
from bumblebee.services.control.orchestrator import execute_workflow_run
from bumblebee.services.rbac.auto_scope import register_auto_scope_listeners
from bumblebee.services.state.event_log import append_event

register_auto_scope_listeners()


async def main() -> int:
    num = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    workflow_name = sys.argv[2] if len(sys.argv) > 2 else "simple-fix-flow"
    provider = os.environ.get("BUMBLEBEE_PROVIDER", "stub")
    print(f"=== Full flow on BB-{num}: register -> plan -> execute ===")
    print(f"Provider: {provider}")
    print(f"Workflow: {workflow_name}\n")

    async with SessionLocal() as db:
        from bumblebee.models.project import Project
        proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
        issue = (
            await db.execute(
                select(Issue).where(Issue.number == num, Issue.project_id == proj.id)
            )
        ).scalar_one_or_none()
        if not issue:
            print(f"ERROR: BB-{num} not found")
            return 1
        print(f"Issue:    {issue.title}")
        print(f"  status={issue.status.value}, complexity={issue.complexity.value if issue.complexity else None}")
        print(f"  scope_hints={issue.scope_hints}")

        if issue.status != IssueStatus.APPROVED:
            issue.status = IssueStatus.APPROVED
            await db.commit()
            print("  -> APPROVED")

        wf = (
            await db.execute(
                select(Workflow).where(
                    Workflow.name == workflow_name, Workflow.is_active == True
                )
            )
        ).scalar_one_or_none()
        if not wf:
            print(f"ERROR: workflow {workflow_name} not loaded")
            return 1

        run = WorkflowRun(
            workflow_id=wf.id, issue_id=issue.id, status=RunStatus.RUNNING,
            current_node="triage", started_at=datetime.now(timezone.utc),
            langgraph_thread_id=str(uuidlib.uuid4()),
            workspace_id=issue.workspace_id,
        )
        db.add(run)
        await db.flush()
        await append_event(
            db, type="workflow_started", issue_id=issue.id,
            project_id=issue.project_id, workflow_run_id=run.id,
            payload={"workflow_name": workflow_name, "provider": provider},
            source="system",
        )

        print(f"\nExecuting workflow {run.id}…\n")
        try:
            final = await execute_workflow_run(db, wf, issue, run)
            await db.commit()
        except Exception as e:
            await db.commit()
            print(f"Workflow failed: {e}")
            return 1

        print(f"\n--- FINAL STATE ---")
        print(f"  workflow status: {run.status.value}")
        print(f"  nodes completed: {final.get('nodes_completed')}")
        print(f"  last_result keys: {list((final.get('last_result') or {}).keys())[:5]}")

        print(f"\n--- EVENT LOG (last 12) ---")
        rows = (
            await db.execute(
                select(Event).where(Event.workflow_run_id == run.id).order_by(Event.occurred_at)
            )
        ).scalars().all()
        for e in rows[-12:]:
            print(f"  {e.occurred_at:%H:%M:%S}  {e.type:<24}  {e.source}")

        print(f"\n--- SESSIONS RAN ---")
        from bumblebee.models.agent_session import AgentSession
        sessions = (
            await db.execute(
                select(AgentSession).where(AgentSession.workflow_run_id == run.id).order_by(AgentSession.started_at)
            )
        ).scalars().all()
        for s in sessions:
            cost = f"${s.dollars_used:.4f}" if s.dollars_used else "0"
            tokens = f"{s.tokens_in}/{s.tokens_out}" if s.tokens_in else "—"
            print(f"  {s.role:<14}  {s.status.value:<10}  cost={cost}  tokens={tokens}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
