"""Tests for issue relations + custom_fields validation.

Uses `db` and `clean_db` fixtures from conftest to avoid event-loop conflicts.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from bumblebee.models.issue import Issue, IssueType, IssueStatus, IssuePriority
from bumblebee.models.issue_relation import (
    IssueRelation, IssueRelationKind, INVERSE_OF,
)
from bumblebee.models.field_schema import FieldSchema
from bumblebee.models.project import Project
from bumblebee.services.issue_links import (
    add_relation, has_cycle_blocks, is_blocked_by_open,
    list_relations_for, RelationError, validate_custom_fields,
)


# ---- Unit tests (no DB) --------------------------------------------------


def test_inverse_map_complete():
    for kind in IssueRelationKind:
        assert kind in INVERSE_OF
    assert INVERSE_OF[IssueRelationKind.BLOCKS] == "blocked_by"
    assert INVERSE_OF[IssueRelationKind.RELATES_TO] == "relates_to"


def test_field_validator_enum_pass():
    from bumblebee.services.issue_links.field_validator import _validate_one
    fd = {"key": "severity", "type": "enum", "options": ["low", "high"]}
    assert _validate_one(fd, "low") == []


def test_field_validator_enum_fail():
    from bumblebee.services.issue_links.field_validator import _validate_one
    fd = {"key": "severity", "type": "enum", "options": ["low", "high"]}
    errs = _validate_one(fd, "garbage")
    assert any("must be one of" in e for e in errs)


def test_field_validator_integer_bounds():
    from bumblebee.services.issue_links.field_validator import _validate_one
    fd = {"key": "points", "type": "integer", "min": 1, "max": 13}
    assert _validate_one(fd, 5) == []
    assert any("<= 13" in e for e in _validate_one(fd, 20))
    assert any(">= 1" in e for e in _validate_one(fd, 0))


def test_field_validator_string_pattern():
    from bumblebee.services.issue_links.field_validator import _validate_one
    fd = {"key": "version", "type": "string", "pattern": r"^v?\d+\.\d+"}
    assert _validate_one(fd, "v1.2") == []
    assert any("pattern" in e for e in _validate_one(fd, "garbage"))


def test_field_validator_required_missing():
    from bumblebee.services.issue_links.field_validator import _validate_one
    fd = {"key": "x", "required": True, "type": "string"}
    errs = _validate_one(fd, None)
    assert any("required" in e for e in errs)


def test_field_validator_url():
    from bumblebee.services.issue_links.field_validator import _validate_one
    fd = {"key": "u", "type": "url"}
    assert _validate_one(fd, "https://x.com") == []
    assert any("must be a URL" in e for e in _validate_one(fd, "garbage"))


# ---- DB tests using clean_db fixture -------------------------------------


async def _make_pair(db, project, base_num: int = 99000):
    a = Issue(project_id=project.id, workspace_id=project.workspace_id,
              number=base_num, title="A", type=IssueType.TASK,
              priority=IssuePriority.LOW, status=IssueStatus.NEW)
    b = Issue(project_id=project.id, workspace_id=project.workspace_id,
              number=base_num + 1, title="B", type=IssueType.TASK,
              priority=IssuePriority.LOW, status=IssueStatus.NEW)
    db.add(a); db.add(b)
    await db.flush()
    return a, b


async def test_add_relation_self_ref_rejected(clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    issues = (await db.execute(select(Issue).where(Issue.project_id == proj.id).limit(1))).scalars().all()
    if not issues:
        pytest.skip("no seed issue")
    i = issues[0]
    with pytest.raises(RelationError, match="self_reference"):
        await add_relation(db, source=i, target=i, kind=IssueRelationKind.BLOCKS)


async def test_add_relation_creates_row(clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    a, b = await _make_pair(db, proj, base_num=99100)
    rel = await add_relation(db, source=a, target=b, kind=IssueRelationKind.RELATES_TO)
    assert rel.id is not None
    assert rel.kind == IssueRelationKind.RELATES_TO


async def test_add_relation_duplicate_rejected(clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    a, b = await _make_pair(db, proj, base_num=99200)
    await add_relation(db, source=a, target=b, kind=IssueRelationKind.RELATES_TO)
    with pytest.raises(RelationError, match="duplicate"):
        await add_relation(db, source=a, target=b, kind=IssueRelationKind.RELATES_TO)


async def test_cycle_detection_blocks(clean_db):
    """A blocks B, then B blocks A → cycle_detected."""
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    a, b = await _make_pair(db, proj, base_num=99300)
    await add_relation(db, source=a, target=b, kind=IssueRelationKind.BLOCKS)
    with pytest.raises(RelationError, match="cycle_detected"):
        await add_relation(db, source=b, target=a, kind=IssueRelationKind.BLOCKS)


async def test_has_cycle_blocks_helper(clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    a, b = await _make_pair(db, proj, base_num=99400)
    assert not await has_cycle_blocks(db, a.id, b.id, IssueRelationKind.BLOCKS)
    db.add(IssueRelation(
        workspace_id=proj.workspace_id, source_issue_id=a.id,
        target_issue_id=b.id, kind=IssueRelationKind.BLOCKS,
    ))
    await db.flush()
    assert await has_cycle_blocks(db, b.id, a.id, IssueRelationKind.BLOCKS)


async def test_list_relations_for_both_directions(clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    a, b = await _make_pair(db, proj, base_num=99500)
    db.add(IssueRelation(
        workspace_id=proj.workspace_id, source_issue_id=a.id,
        target_issue_id=b.id, kind=IssueRelationKind.BLOCKS,
    ))
    await db.flush()

    a_rels = await list_relations_for(db, a.id)
    assert "blocks" in a_rels
    b_rels = await list_relations_for(db, b.id)
    assert "blocked_by" in b_rels


async def test_is_blocked_by_open_lists_blockers(clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    blocker = Issue(project_id=proj.id, workspace_id=proj.workspace_id,
                    number=99600, title="blocker", type=IssueType.TASK,
                    priority=IssuePriority.LOW, status=IssueStatus.NEW)
    blocked = Issue(project_id=proj.id, workspace_id=proj.workspace_id,
                    number=99601, title="blocked", type=IssueType.TASK,
                    priority=IssuePriority.LOW, status=IssueStatus.APPROVED)
    db.add(blocker); db.add(blocked)
    await db.flush()
    db.add(IssueRelation(
        workspace_id=proj.workspace_id, source_issue_id=blocker.id,
        target_issue_id=blocked.id, kind=IssueRelationKind.BLOCKS,
    ))
    await db.flush()
    result = await is_blocked_by_open(db, blocked.id)
    assert any(b.id == blocker.id for b in result)

    blocker.status = IssueStatus.CLOSED
    await db.flush()
    result2 = await is_blocked_by_open(db, blocked.id)
    assert not any(b.id == blocker.id for b in result2)


async def test_validate_custom_fields_with_schema(clean_db):
    db = clean_db
    proj = (await db.execute(select(Project).where(Project.slug == "bb"))).scalar_one()
    # Clear any pre-existing schema for BUG to avoid unique-constraint collision
    existing = (
        await db.execute(
            select(FieldSchema).where(
                FieldSchema.workspace_id == proj.workspace_id,
                FieldSchema.project_id == proj.id,
                FieldSchema.issue_type == IssueType.BUG,
            )
        )
    ).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.flush()
    schema = FieldSchema(
        workspace_id=proj.workspace_id, project_id=proj.id,
        issue_type=IssueType.BUG,
        schema={"fields": [
            {"key": "severity", "type": "enum",
             "options": ["low", "high"], "required": True},
            {"key": "version", "type": "string", "pattern": r"^v\d"},
        ]},
    )
    db.add(schema)
    issue = Issue(project_id=proj.id, workspace_id=proj.workspace_id,
                  number=99700, title="bug for validation", type=IssueType.BUG,
                  priority=IssuePriority.HIGH, status=IssueStatus.NEW)
    db.add(issue)
    await db.flush()

    good = await validate_custom_fields(db, issue, {"severity": "high", "version": "v1.2"})
    assert good.ok, good.errors

    bad = await validate_custom_fields(db, issue, {"severity": "garbage"})
    assert not bad.ok
    assert any("severity" in e for e in bad.errors)

    missing_required = await validate_custom_fields(db, issue, {"version": "v1.0"})
    assert not missing_required.ok
    assert any("severity" in e and "required" in e for e in missing_required.errors)
