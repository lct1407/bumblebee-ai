"""Test: workflow trigger → events → state mutation."""
import pytest


@pytest.mark.asyncio
async def test_trigger_workflow_emits_full_event_chain(client, clean_db):
    # Pick BB-1
    issue = (await client.get("/api/projects/bb/issues/1")).json()
    r = await client.post(
        "/api/workflow-runs/trigger",
        json={"issue_id": issue["id"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "completed"
    assert body["workflow_name"] == "simple-fix-flow"

    # Event chain check
    events = (await client.get(f"/api/events?issue_id={issue['id']}&limit=20")).json()
    types_desc = [e["type"] for e in events]
    expected_subset = {
        "workflow_started",
        "session_started",
        "llm_call",
        "cost_charged",
        "session_completed",
        "workflow_completed",
    }
    assert expected_subset.issubset(set(types_desc)), f"missing events: {expected_subset - set(types_desc)}"


@pytest.mark.asyncio
async def test_triager_mutates_issue(client, clean_db):
    issue = (await client.get("/api/projects/bb/issues/2")).json()
    await client.post("/api/workflow-runs/trigger", json={"issue_id": issue["id"]})

    after = (await client.get("/api/projects/bb/issues/2")).json()
    assert after["complexity"] == "simple"  # stub output
    assert after["ai_confidence"] == 0.85
    assert "Stub triage" in (after["ai_summary"] or "")


@pytest.mark.asyncio
async def test_trigger_404_invalid_issue(client):
    r = await client.post(
        "/api/workflow-runs/trigger",
        json={"issue_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_unknown_workflow_404(client, clean_db):
    issue = (await client.get("/api/projects/bb/issues/1")).json()
    r = await client.post(
        "/api/workflow-runs/trigger",
        json={"issue_id": issue["id"], "workflow_name": "does-not-exist"},
    )
    assert r.status_code == 404
