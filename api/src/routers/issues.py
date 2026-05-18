"""Issue CRUD + workflow trigger."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models.issue import Issue, IssueStatus
from src.models.project import Project
from src.schemas.issue import IssueCreate, IssueUpdate, IssueOut
from src.services.state.event_log import append_event

router = APIRouter(prefix="/api/projects/{slug}/issues", tags=["issues"])


@router.get("", response_model=list[IssueOut])
async def list_issues(
    slug: str,
    status: IssueStatus | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[Issue]:
    project = (
        await db.execute(select(Project).where(Project.slug == slug))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "project_not_found")

    stmt = select(Issue).where(Issue.project_id == project.id, Issue.deleted_at.is_(None))
    if status:
        stmt = stmt.where(Issue.status == status)
    stmt = stmt.order_by(Issue.number.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=IssueOut, status_code=201)
async def create_issue(
    slug: str, body: IssueCreate, db: AsyncSession = Depends(get_db)
) -> Issue:
    project = (
        await db.execute(select(Project).where(Project.slug == slug))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "project_not_found")

    # Per-project numbering
    max_num = (
        await db.execute(
            select(func.coalesce(func.max(Issue.number), 0)).where(Issue.project_id == project.id)
        )
    ).scalar()
    next_num = (max_num or 0) + 1

    issue = Issue(
        **body.model_dump(),
        project_id=project.id,
        number=next_num,
    )
    db.add(issue)
    await db.flush()

    await append_event(
        db,
        type="status_change",
        issue_id=issue.id,
        project_id=project.id,
        payload={"from": None, "to": IssueStatus.NEW.value},
        source="user",
    )
    await db.commit()
    await db.refresh(issue)
    return issue


@router.get("/{number}", response_model=IssueOut)
async def get_issue_by_number(
    slug: str, number: int, db: AsyncSession = Depends(get_db)
) -> Issue:
    project = (
        await db.execute(select(Project).where(Project.slug == slug))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "project_not_found")
    issue = (
        await db.execute(
            select(Issue).where(Issue.project_id == project.id, Issue.number == number)
        )
    ).scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "issue_not_found")
    return issue


@router.patch("/{number}", response_model=IssueOut)
async def update_issue(
    slug: str, number: int, body: IssueUpdate, db: AsyncSession = Depends(get_db)
) -> Issue:
    project = (
        await db.execute(select(Project).where(Project.slug == slug))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "project_not_found")
    issue = (
        await db.execute(
            select(Issue).where(Issue.project_id == project.id, Issue.number == number)
        )
    ).scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "issue_not_found")

    old_status = issue.status
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(issue, k, v)

    if body.status is not None and body.status != old_status:
        await append_event(
            db,
            type="status_change",
            issue_id=issue.id,
            project_id=project.id,
            payload={"from": old_status.value, "to": body.status.value},
            source="user",
        )

    await db.commit()
    await db.refresh(issue)
    return issue
