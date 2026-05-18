"""Test: WorkflowEngine — YAML loading + LangGraph StateGraph build."""
from pathlib import Path
import pytest

from src.services.control.workflow_engine import WorkflowEngine

WORKFLOWS_DIR = Path(__file__).parent.parent.parent / "workflows"


def test_load_simple_workflow():
    engine = WorkflowEngine(WORKFLOWS_DIR)
    data, h = engine.load_workflow("simple-fix-flow")
    assert data["name"] == "simple-fix-flow"
    assert len(h) == 64  # SHA-256 hex
    assert any(n["id"] == "triage" for n in data["nodes"])


def test_load_unknown_workflow_raises():
    engine = WorkflowEngine(WORKFLOWS_DIR)
    with pytest.raises(FileNotFoundError):
        engine.load_workflow("nope")


def test_build_graph_smoke():
    engine = WorkflowEngine(WORKFLOWS_DIR)
    data, _ = engine.load_workflow("simple-fix-flow")
    graph = engine.build_graph(data)
    # Just verify no exception; full LangGraph compile tested in integration
    assert graph is not None


def test_compile_workflow_returns_hash():
    engine = WorkflowEngine(WORKFLOWS_DIR)
    compiled, h = engine.compile_workflow("simple-fix-flow")
    assert compiled is not None
    assert len(h) == 64
