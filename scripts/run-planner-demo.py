"""Run Planner on BB-4 — demonstrates which provider runs.

Usage:
  BUMBLEBEE_LLM_PROVIDER=stub        python scripts/run-planner-demo.py 4
  BUMBLEBEE_LLM_PROVIDER=claude-cli  python scripts/run-planner-demo.py 4
  BUMBLEBEE_LLM_PROVIDER=gemini      python scripts/run-planner-demo.py 4
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
from bumblebee.models.issue import Issue, IssueStatus
from bumblebee.models.workflow import Workflow
from bumblebee.models.workflow_run import RunStatus, WorkflowRun
from bumblebee.services.control.orchestrator import execute_workflow_run
from bumblebee.services.rbac.auto_scope import register_auto_scope_listeners
from bumblebee.services.state.event_log import append_event

register_auto_scope_listeners()


async def main() -> int:
    num = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    provider = os.environ.get("BUMBLEBEE_LLM_PROVIDER", "stub")
    print(f"=== Trigger Planner on BB-{num} ===")
    print(f"Provider: {provider}")
    print(f"  stub       = canned responses")
    print(f"  claude-cli = real Claude (subprocess `claude` CLI)")
    print(f"  gemini     = Vertex AI Gemini\n")

    async with SessionLocal() as db:
        issue = (
            await db.execute(select(Issue).where(Issue.number == num))
        ).scalar_one_or_none()
        if not issue:
            print(f"ERROR: BB-{num} not found")
            return 1
        print(f"Issue: {issue.title}")
        print(f"  status={issue.status.value}, complexity={issue.complexity.value if issue.complexity else None}")

        # Approve if not yet
        if issue.status != IssueStatus.APPROVED:
            issue.status = IssueStatus.APPROVED
            await db.commit()
            print(f"  -> set status=APPROVED")

        # Force feature-complex-flow (has 'plan' node = Coordinator role)
        wf = (
            await db.execute(
                select(Workflow).where(
                    Workflow.name == "feature-complex-flow", Workflow.is_active == True
                )
            )
        ).scalar_one_or_none()
        if not wf:
            print("ERROR: feature-complex-flow not loaded")
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
            payload={"workflow_name": "feature-complex-flow", "provider": provider},
            source="system",
        )

        print(f"\nExecuting workflow run {run.id}…")
        try:
            final = await execute_workflow_run(db, wf, issue, run)
            await db.commit()
            print(f"\nFinal state:")
            print(f"  status: {run.status.value}")
            print(f"  nodes completed: {final.get('nodes_completed')}")
            print(f"  last_result: {final.get('last_result')}")
        except Exception as e:
            await db.commit()
            print(f"Workflow failed: {e}")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
