"""Issue relations service: add/list + cycle detection + auto-status helpers."""
from __future__ import annotations

import uuid
from collections import defaultdict, deque

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.issue import Issue, IssueStatus
from bumblebee.models.issue_relation import (
    INVERSE_OF,
    IssueRelation,
    IssueRelationKind,
)


class RelationError(Exception):
    pass


# ---- Add + list -----------------------------------------------------------


async def add_relation(
    db: AsyncSession,
    *,
    source: Issue,
    target: Issue,
    kind: IssueRelationKind,
    note: str | None = None,
    created_by_user_id: uuid.UUID | None = None,
) -> IssueRelation:
    """Insert a relation with cycle + workspace + self-ref validation."""
    if source.id == target.id:
        raise RelationError("self_reference_not_allowed")
    if source.workspace_id != target.workspace_id:
        raise RelationError("cross_workspace_relation_not_allowed")
    existing = (
        await db.execute(
            select(IssueRelation).where(
                IssueRelation.source_issue_id == source.id,
                IssueRelation.target_issue_id == target.id,
                IssueRelation.kind == kind,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise RelationError("duplicate_relation")

    # Cycle check only for blocking/depends_on edges
    if kind in (IssueRelationKind.BLOCKS, IssueRelationKind.DEPENDS_ON):
        if await has_cycle_blocks(db, source.id, target.id, kind):
            raise RelationError(f"cycle_detected_via_{kind.value}")

    rel = IssueRelation(
        workspace_id=source.workspace_id,
        source_issue_id=source.id, target_issue_id=target.id,
        kind=kind, note=note, created_by_user_id=created_by_user_id,
    )
    db.add(rel)
    await db.flush()
    return rel


async def list_relations_for(
    db: AsyncSession, issue_id: uuid.UUID
) -> dict[str, list[dict]]:
    """Group relations as {kind_label: [{issue, note, id}, ...]}.

    Returns BOTH outgoing (where this issue is source) and incoming
    (inverse kind label, where this issue is target).
    """
    out: dict[str, list[dict]] = defaultdict(list)

    # Outgoing
    rels = (
        await db.execute(
            select(IssueRelation).where(IssueRelation.source_issue_id == issue_id)
        )
    ).scalars().all()
    for r in rels:
        out[r.kind.value].append({
            "relation_id": str(r.id),
            "issue_id": str(r.target_issue_id),
            "note": r.note,
        })

    # Incoming → use inverse label
    rels_in = (
        await db.execute(
            select(IssueRelation).where(IssueRelation.target_issue_id == issue_id)
        )
    ).scalars().all()
    for r in rels_in:
        label = INVERSE_OF.get(r.kind, r.kind.value)
        out[label].append({
            "relation_id": str(r.id),
            "issue_id": str(r.source_issue_id),
            "note": r.note,
        })

    return dict(out)


# ---- Cycle detection ------------------------------------------------------


async def has_cycle_blocks(
    db: AsyncSession,
    proposed_source: uuid.UUID,
    proposed_target: uuid.UUID,
    kind: IssueRelationKind,
) -> bool:
    """Return True if adding (proposed_source --kind--> proposed_target)
    would create a directed cycle considering existing edges of the same kind.

    BFS from proposed_target following same-kind edges; if we reach
    proposed_source, that's a cycle.
    """
    if kind not in (IssueRelationKind.BLOCKS, IssueRelationKind.DEPENDS_ON):
        return False

    visited: set[uuid.UUID] = {proposed_target}
    frontier: deque[uuid.UUID] = deque([proposed_target])
    while frontier:
        cur = frontier.popleft()
        if cur == proposed_source:
            return True
        next_edges = (
            await db.execute(
                select(IssueRelation.target_issue_id).where(
                    IssueRelation.source_issue_id == cur,
                    IssueRelation.kind == kind,
                )
            )
        ).scalars().all()
        for nxt in next_edges:
            if nxt in visited:
                continue
            visited.add(nxt)
            frontier.append(nxt)
    return False


# ---- Auto-status gate ------------------------------------------------------


_OPEN_STATUSES = {
    IssueStatus.NEW, IssueStatus.TRIAGED, IssueStatus.PLANNED,
    IssueStatus.APPROVED, IssueStatus.IN_PROGRESS, IssueStatus.IN_REVIEW,
    IssueStatus.DEVELOPED, IssueStatus.DEPLOYING, IssueStatus.TESTING,
    IssueStatus.STAGING, IssueStatus.BLOCKED, IssueStatus.NEEDS_INFO,
    IssueStatus.ON_HOLD, IssueStatus.REOPEN,
}


async def is_blocked_by_open(
    db: AsyncSession, issue_id: uuid.UUID
) -> list[Issue]:
    """Return list of OPEN issues that block this one (kind=blocks where
    target=issue_id, or kind=depends_on where source=issue_id).
    """
    blockers: list[Issue] = []

    # 'blocked_by' = inverse of someone-else's 'blocks' → look for rows where
    # this issue is the TARGET of a 'blocks' edge
    blocks_in = (
        await db.execute(
            select(IssueRelation).where(
                IssueRelation.target_issue_id == issue_id,
                IssueRelation.kind == IssueRelationKind.BLOCKS,
            )
        )
    ).scalars().all()
    for r in blocks_in:
        src = await db.get(Issue, r.source_issue_id)
        if src and src.status in _OPEN_STATUSES:
            blockers.append(src)

    # depends_on: this issue depends on someone else → that other must be DONE
    depends_out = (
        await db.execute(
            select(IssueRelation).where(
                IssueRelation.source_issue_id == issue_id,
                IssueRelation.kind == IssueRelationKind.DEPENDS_ON,
            )
        )
    ).scalars().all()
    for r in depends_out:
        tgt = await db.get(Issue, r.target_issue_id)
        if tgt and tgt.status in _OPEN_STATUSES:
            blockers.append(tgt)

    return blockers
