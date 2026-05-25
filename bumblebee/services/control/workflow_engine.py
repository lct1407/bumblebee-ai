"""WorkflowEngine: wraps LangGraph; loads YAML → builds StateGraph. Plane 1."""
import hashlib
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypedDict

import yaml
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph


class WorkflowState(TypedDict, total=False):
    """Shared state passed between workflow nodes (LangGraph TypedDict)."""
    issue_id: str
    project_id: str
    current_node: str
    complexity: str
    plan_summary: str
    sub_tasks: list
    decisions: list
    last_result: dict
    failure_reason: str | None


class WorkflowEngine:
    """Loads workflow YAML and builds a LangGraph StateGraph."""

    def __init__(self, workflows_dir: str | Path):
        self.workflows_dir = Path(workflows_dir)
        self._node_handlers: dict[str, Callable] = {}

    def register_handler(self, role: str, handler: Callable) -> None:
        """Register an async handler for a role (called by Execution Plane harness)."""
        self._node_handlers[role] = handler

    def load_workflow(self, name: str) -> tuple[dict, str]:
        """Load workflow YAML by name. Returns (graph_dict, sha256_hash)."""
        path = self.workflows_dir / f"{name}.yaml"
        text = path.read_text(encoding="utf-8")
        data = yaml.safe_load(text)
        h = hashlib.sha256(text.encode()).hexdigest()
        return data, h

    def build_graph(self, workflow_def: dict) -> StateGraph:
        """Build a LangGraph StateGraph from declarative workflow definition."""
        graph = StateGraph(WorkflowState)

        nodes = workflow_def.get("nodes", [])

        # Register nodes
        for node in nodes:
            node_id = node["id"]
            role = node.get("role", node_id)
            handler = self._node_handlers.get(role)
            if handler is None:
                # Default stub: log and pass through
                async def _stub(state: WorkflowState, _role=role, _id=node_id) -> dict:
                    return {"current_node": _id, "last_result": {"role": _role, "status": "stub_ok"}}
                graph.add_node(node_id, _stub)
            else:
                graph.add_node(node_id, handler)

        # Entry edge
        if nodes:
            graph.add_edge(START, nodes[0]["id"])

        # Conditional + linear edges
        for node in nodes:
            node_id = node["id"]
            on_success = node.get("on_success")
            node.get("on_fail")
            if isinstance(on_success, str):
                if on_success == "done":
                    graph.add_edge(node_id, END)
                else:
                    graph.add_edge(node_id, on_success)
            # on_fail handled by classifier in Execution Plane; routes back via state

        return graph

    def compile_workflow(self, name: str) -> tuple[Any, str]:
        """Load + compile a workflow. Returns (compiled_graph, hash)."""
        data, h = self.load_workflow(name)
        graph = self.build_graph(data)
        checkpointer = MemorySaver()  # Phase 1 minimum; swap to PostgresSaver later
        compiled = graph.compile(checkpointer=checkpointer)
        return compiled, h
