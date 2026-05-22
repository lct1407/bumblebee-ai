"""Workflow orchestrator — Phase 1.5 wiring of LangGraph multi-node traversal.

Replaces the workflow_runs router single-triager-call with full graph execution.
Each workflow node creates a fresh AgentSession + calls harness.run_role.

Side-effects:
- Each node emits session_started → llm_call → cost_charged → session_completed events
- Workflow state accumulates `last_result` per node
- Terminator nodes return without dispatching agent
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from sqlalchemy.ext.asyncio import AsyncSession
from typing import TypedDict

from bumblebee.models.agent_session import AgentSession, SessionStatus
from bumblebee.models.issue import Issue
from bumblebee.models.workflow import Workflow
from bumblebee.models.workflow_run import RunStatus, WorkflowRun
from bumblebee.services.execution.harness import run_role
from bumblebee.services.state.event_log import append_event


WORKFLOWS_DIR = Path(__file__).parent.parent.parent / "workflows"


class State(TypedDict, total=False):
    issue_id: str
    project_id: str
    workflow_run_id: str
    current_node: str
    nodes_completed: list
    last_result: dict
    failure_reason: str | None


def _node_handler_factory(
    db: AsyncSession,
    issue: Issue,
    run: WorkflowRun,
    node_id: str,
    role: str,
) -> Callable:
    """Build an async LangGraph node handler that runs harness role + updates state."""

    async def handler(state: State) -> dict:
        # Terminator: nothing to do, just mark complete
        if role in ("terminator", "done"):
            return {"current_node": node_id, "nodes_completed": state.get("nodes_completed", []) + [node_id]}

        sess = AgentSession(
            role=role,
            phase=node_id,
            provider="stub",
            issue_id=issue.id,
            workflow_run_id=run.id,
            budget_wall_min=60,
            budget_tokens_max=160_000,
            budget_dollars_max=3.0,
        )
        db.add(sess)
        await db.flush()

        result = await run_role(
            db,
            session=sess,
            role=role,
            input_state={
                "issue_id": str(issue.id),
                "title": issue.title,
                "description": issue.description or "",
                "previous": state.get("last_result"),
            },
        )

        return {
            "current_node": node_id,
            "nodes_completed": state.get("nodes_completed", []) + [node_id],
            "last_result": result.output,
        }

    return handler


def _build_state_graph(
    db: AsyncSession,
    issue: Issue,
    run: WorkflowRun,
    workflow_def: dict,
) -> StateGraph:
    """Construct LangGraph StateGraph from declarative workflow YAML."""
    graph = StateGraph(State)
    nodes = workflow_def.get("nodes", [])

    for node in nodes:
        node_id = node["id"]
        role = node.get("role", node_id)
        handler = _node_handler_factory(db, issue, run, node_id, role)
        graph.add_node(node_id, handler)

    if nodes:
        graph.add_edge(START, nodes[0]["id"])

    # Resolve edges. on_success may be: node_id (str), "done", or omitted (=> END)
    for node in nodes:
        node_id = node["id"]
        on_success = node.get("on_success")
        role = node.get("role", node_id)

        if role in ("terminator", "done"):
            graph.add_edge(node_id, END)
            continue

        if isinstance(on_success, str):
            if on_success == "done":
                graph.add_edge(node_id, END)
            else:
                # Verify target exists; otherwise → END
                target_exists = any(n["id"] == on_success for n in nodes)
                if target_exists:
                    graph.add_edge(node_id, on_success)
                else:
                    graph.add_edge(node_id, END)
        elif on_success is None and not any(n["id"] == "done" for n in nodes):
            # Linear-default: edge to next node in YAML order
            idx = nodes.index(node)
            if idx + 1 < len(nodes):
                graph.add_edge(node_id, nodes[idx + 1]["id"])
            else:
                graph.add_edge(node_id, END)
        elif on_success is None:
            graph.add_edge(node_id, END)

    return graph


async def execute_workflow_run(
    db: AsyncSession,
    workflow: Workflow,
    issue: Issue,
    run: WorkflowRun,
) -> dict:
    """Execute a full LangGraph workflow run for an issue.

    Returns final state dict. Updates run.status + run.current_node + events.
    """
    graph = _build_state_graph(db, issue, run, workflow.graph)
    checkpointer = MemorySaver()
    compiled = graph.compile(checkpointer=checkpointer)

    initial_state: State = {
        "issue_id": str(issue.id),
        "project_id": str(issue.project_id),
        "workflow_run_id": str(run.id),
        "nodes_completed": [],
    }

    try:
        final_state = await compiled.ainvoke(
            initial_state,
            config={"configurable": {"thread_id": str(run.id)}},
        )
        run.current_node = final_state.get("current_node") or "done"
        run.status = RunStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        await append_event(
            db,
            type="workflow_completed",
            issue_id=issue.id,
            project_id=issue.project_id,
            workflow_run_id=run.id,
            payload={
                "final_status": run.status.value,
                "nodes_completed": final_state.get("nodes_completed", []),
            },
            source="system",
        )
        return final_state
    except Exception as e:
        run.status = RunStatus.FAILED
        run.completed_at = datetime.now(timezone.utc)
        await append_event(
            db,
            type="workflow_failed",
            issue_id=issue.id,
            project_id=issue.project_id,
            workflow_run_id=run.id,
            payload={"error": str(e)[:500]},
            source="system",
        )
        raise
