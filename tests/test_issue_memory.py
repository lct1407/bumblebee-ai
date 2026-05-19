"""Test: IssueMemory projection from event log."""
import pytest
from sqlalchemy import select

from bumblebee.models.issue import Issue
from bumblebee.services.state.event_log import append_event
from bumblebee.services.state.issue_memory import project_issue_memory


@pytest.mark.asyncio
async def test_empty_issue_memory(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    memory = await project_issue_memory(db, issue.id)
    assert memory["episodic"] == []
    assert memory["semantic"] == {}
    assert memory["working"] == {"open_sub_tasks": [], "blockers": [], "active_leases": []}


@pytest.mark.asyncio
async def test_issue_memory_collects_episodic(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    # Append a few events
    await append_event(db, type="status_change", issue_id=issue.id,
                       payload={"from": "new", "to": "approved"}, source="user")
    await append_event(db, type="decision_taken", issue_id=issue.id,
                       payload={"kind": "complexity", "value": "complex"}, source="agent")
    await append_event(db, type="plan_complete", issue_id=issue.id,
                       payload={"plan_summary": "split into 3", "sub_tasks": [1, 2, 3]},
                       source="agent")
    await db.commit()

    memory = await project_issue_memory(db, issue.id)
    assert len(memory["episodic"]) == 3
    assert memory["semantic"]["complexity"] == "complex"
    assert memory["semantic"]["plan_summary"] == "split into 3"
    assert memory["semantic"]["sub_tasks"] == [1, 2, 3]


@pytest.mark.asyncio
async def test_issue_memory_tracks_active_leases(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()

    await append_event(db, type="lease_acquired", issue_id=issue.id,
                       payload={"lease_id": "L1", "patterns": ["src/**"]},
                       source="system")
    await append_event(db, type="lease_acquired", issue_id=issue.id,
                       payload={"lease_id": "L2", "patterns": ["tests/**"]},
                       source="system")
    await append_event(db, type="lease_released", issue_id=issue.id,
                       payload={"lease_id": "L1"}, source="system")
    await db.commit()

    memory = await project_issue_memory(db, issue.id)
    active = memory["working"]["active_leases"]
    lease_ids = {l["lease_id"] for l in active}
    assert lease_ids == {"L2"}  # L1 released
