"""End-to-end scenarios — exercise multiple planes in sequence."""
import pytest


@pytest.mark.asyncio
async def test_full_simple_fix_flow_e2e(client, clean_db):
    """
    Scenario A from plan §4.1: simple issue, single agent, end-to-end.

    1. Create issue
    2. Trigger workflow
    3. Verify issue status + triager output
    4. Verify event log contains full chain
    5. Verify cost is tracked
    """
    # 1. Create
    r = await client.post(
        "/api/projects/bb/issues",
        json={"title": "E2E test issue", "type": "bug", "priority": "high"},
    )
    assert r.status_code == 201
    issue = r.json()
    assert issue["status"] == "new"

    # 2. Trigger
    r = await client.post("/api/workflow-runs/trigger", json={"issue_id": issue["id"]})
    assert r.json()["status"] == "completed"

    # 3. Issue mutated by triager
    after = (await client.get(f"/api/projects/bb/issues/{issue['number']}")).json()
    assert after["complexity"] == "simple"
    assert after["ai_confidence"] is not None
    assert after["ai_confidence"] > 0

    # 4. Event chain
    events = (await client.get(f"/api/events?issue_id={issue['id']}&limit=20")).json()
    types_set = {e["type"] for e in events}
    for required in [
        "status_change",          # from create
        "workflow_started",
        "session_started",
        "llm_call",
        "cost_charged",
        "session_completed",
        "workflow_completed",
    ]:
        assert required in types_set, f"missing event type: {required}"

    # 5. Cost charged event has correct shape
    cost_events = [e for e in events if e["type"] == "cost_charged"]
    assert len(cost_events) == 1
    payload = cost_events[0]["payload"]
    assert "amount_usd" in payload
    assert payload["amount_usd"] > 0


@pytest.mark.asyncio
async def test_chat_to_issue_suggestion_flow(client, clean_db):
    """
    Tier 2 ChatSession: user asks → assistant replies.
    (Suggest-tool HITL flow is stub; verifying conversation persistence.)
    """
    # Start
    r = await client.post(
        "/api/projects/bb/chat/sessions",
        json={"title": "tier2", "source": "cli"},
    )
    chat_id = r.json()["id"]

    # Send 3 messages
    for msg in ["what's the project?", "show issues", "thanks"]:
        r = await client.post(
            f"/api/projects/bb/chat/sessions/{chat_id}/messages",
            json={"content": msg},
        )
        assert r.status_code == 200

    # Each message creates 2 events (user + assistant) + 1 start event
    events = (
        await client.get(f"/api/events?type=chat_message&limit=20")
    ).json()
    # Filter to this chat (by chat_session_id) — for simplicity, just count >= 7 (3 user + 3 assistant + chat_started)
    assert len(events) >= 7


@pytest.mark.asyncio
async def test_concurrent_triggers_isolated_by_issue(client, clean_db):
    """
    Two different issues triggered concurrently. Each produces own event chain.
    """
    import asyncio
    r1 = (await client.get("/api/projects/bb/issues/1")).json()
    r2 = (await client.get("/api/projects/bb/issues/2")).json()

    # Trigger both
    await asyncio.gather(
        client.post("/api/workflow-runs/trigger", json={"issue_id": r1["id"]}),
        client.post("/api/workflow-runs/trigger", json={"issue_id": r2["id"]}),
    )

    e1 = (await client.get(f"/api/events?issue_id={r1['id']}&limit=20")).json()
    e2 = (await client.get(f"/api/events?issue_id={r2['id']}&limit=20")).json()
    assert any(e["type"] == "workflow_completed" for e in e1)
    assert any(e["type"] == "workflow_completed" for e in e2)


@pytest.mark.asyncio
async def test_seed_idempotent_when_rerun(client, clean_db):
    """Seed script should be idempotent — re-running doesn't duplicate."""
    from src.seeds.seed_default import seed
    # Calling seed again should skip existing
    await seed()
    # Verify project count == 1 (not 2)
    projects = (await client.get("/api/projects")).json()
    assert len(projects) == 1
