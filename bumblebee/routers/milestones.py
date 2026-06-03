"""Milestone CRUD + progress aggregation (project progress planning)."""
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.issue import Issue, IssueStatus
from bumblebee.models.milestone import Milestone
from bumblebee.models.project import Project
from bumblebee.schemas.milestone import MilestoneCreate, MilestoneOut, MilestoneUpdate

router = APIRouter(prefix="/api/projects/{slug}/milestones", tags=["milestones"])

# Statuses that count as "done" for progress.
_DONE = {IssueStatus.CLOSED, IssueStatus.RELEASED}


async def _project_or_404(slug: str, db: AsyncSession) -> Project:
    project = (
        await db.execute(select(Project).where(Project.slug == slug, Project.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "project_not_found")
    return project


async def _progress(db: AsyncSession, project_id: uuid.UUID) -> dict[uuid.UUID, tuple[int, int]]:
    """Return {milestone_id: (total, done)} for all issues in the project."""
    rows = (
        await db.execute(
            select(Issue.milestone_id, Issue.status, func.count())
            .where(
                Issue.project_id == project_id,
                Issue.milestone_id.isnot(None),
                Issue.deleted_at.is_(None),
            )
            .group_by(Issue.milestone_id, Issue.status)
        )
    ).all()
    agg: dict[uuid.UUID, tuple[int, int]] = {}
    for mid, status, count in rows:
        total, done = agg.get(mid, (0, 0))
        total += count
        if status in _DONE:
            done += count
        agg[mid] = (total, done)
    return agg


def _to_out(m: Milestone, total: int, done: int) -> MilestoneOut:
    out = MilestoneOut.model_validate(m)
    out.total_issues = total
    out.done_issues = done
    out.progress_pct = round(done / total * 100) if total else 0
    return out


@router.get("", response_model=list[MilestoneOut])
async def list_milestones(slug: str, db: AsyncSession = Depends(get_db)) -> list[MilestoneOut]:
    project = await _project_or_404(slug, db)
    milestones = (
        await db.execute(
            select(Milestone)
            .where(Milestone.project_id == project.id, Milestone.deleted_at.is_(None))
            .order_by(Milestone.due_date.is_(None), Milestone.due_date.asc(), Milestone.created_at.asc())
        )
    ).scalars().all()
    agg = await _progress(db, project.id)
    return [_to_out(m, *agg.get(m.id, (0, 0))) for m in milestones]


@router.post("", response_model=MilestoneOut, status_code=201)
async def create_milestone(
    slug: str, body: MilestoneCreate, db: AsyncSession = Depends(get_db)
) -> MilestoneOut:
    project = await _project_or_404(slug, db)
    m = Milestone(**body.model_dump(), project_id=project.id)
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return _to_out(m, 0, 0)


@router.patch("/{milestone_id}", response_model=MilestoneOut)
async def update_milestone(
    slug: str, milestone_id: uuid.UUID, body: MilestoneUpdate, db: AsyncSession = Depends(get_db)
) -> MilestoneOut:
    project = await _project_or_404(slug, db)
    m = (
        await db.execute(
            select(Milestone).where(Milestone.id == milestone_id, Milestone.project_id == project.id)
        )
    ).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "milestone_not_found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    await db.commit()
    await db.refresh(m)
    agg = await _progress(db, project.id)
    return _to_out(m, *agg.get(m.id, (0, 0)))


@router.delete("/{milestone_id}", status_code=204)
async def delete_milestone(
    slug: str, milestone_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> None:
    project = await _project_or_404(slug, db)
    m = (
        await db.execute(
            select(Milestone).where(Milestone.id == milestone_id, Milestone.project_id == project.id)
        )
    ).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "milestone_not_found")
    m.deleted_at = datetime.now(UTC)
    # Detach issues from the deleted milestone.
    issues = (
        await db.execute(select(Issue).where(Issue.milestone_id == m.id))
    ).scalars().all()
    for issue in issues:
        issue.milestone_id = None
    await db.commit()
