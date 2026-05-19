"""Test: Issue CRUD + per-project numbering + status update events."""
import pytest


@pytest.mark.asyncio
async def test_list_seeded_issues(client, clean_db):
    r = await client.get("/api/projects/bb/issues")
    assert r.status_code == 200
    issues = r.json()
    assert len(issues) == 3
    numbers = {i["number"] for i in issues}
    assert numbers == {1, 2, 3}


@pytest.mark.asyncio
async def test_create_issue_assigns_next_number(client, clean_db):
    r = await client.post(
        "/api/projects/bb/issues",
        json={"title": "new", "type": "task", "priority": "medium"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["number"] == 4
    assert data["status"] == "new"

    # Second creation gets 5
    r2 = await client.post("/api/projects/bb/issues", json={"title": "another"})
    assert r2.json()["number"] == 5


@pytest.mark.asyncio
async def test_get_by_number(client, clean_db):
    r = await client.get("/api/projects/bb/issues/1")
    assert r.status_code == 200
    assert r.json()["number"] == 1


@pytest.mark.asyncio
async def test_404_unknown_project(client):
    r = await client.get("/api/projects/does-not-exist/issues")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_status_creates_event(client, clean_db):
    # Ensure issue 1 baseline = "new" regardless of prior test order
    from sqlalchemy import text as sql_text
    await clean_db.execute(sql_text("UPDATE issues SET status='new' WHERE number=1"))
    await clean_db.execute(sql_text("TRUNCATE events RESTART IDENTITY CASCADE"))
    await clean_db.commit()

    # Update status
    r = await client.patch(
        "/api/projects/bb/issues/1",
        json={"status": "approved"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "approved"

    issue_id = r.json()["id"]
    # Verify a status_change event was created
    r2 = await client.get(f"/api/events?issue_id={issue_id}")
    all_events = r2.json()
    status_changes = [e for e in all_events if e["type"] == "status_change"]
    assert len(status_changes) >= 1, f"no status_change event found; all events: {[e['type'] for e in all_events]}"
    last = status_changes[0]  # ordered desc
    assert last["payload"]["from"] == "new"
    assert last["payload"]["to"] == "approved"
