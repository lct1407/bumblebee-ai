"""Issue CRUD + workflow trigger."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.issue import Issue, IssueStatus
from bumblebee.models.notification import Notification, NotificationType
from bumblebee.models.project import Project
from bumblebee.models.user import User
from bumblebee.schemas.issue import IssueCreate, IssueOut, IssueUpdate
from bumblebee.services.state.event_log import append_event

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

    # Emit one field_changed event per mutated field for audit trail.
    # Status change keeps its dedicated event type for backward compat.
    patch = body.model_dump(exclude_unset=True)
    old_assignee = issue.assignee_id
    AUDITED_FIELDS = {
        "status", "priority", "type", "title", "description", "complexity",
        "scope_hints", "acceptance_criteria", "ai_summary",
        "assignee_id", "milestone_id", "estimate",
    }

    def _normalize(v):
        # Enum → its value; UUID → str; preserves JSON-shape in event payload
        if hasattr(v, "value"):
            return v.value
        if isinstance(v, uuid.UUID):
            return str(v)
        return v

    for k, v in patch.items():
        if k not in AUDITED_FIELDS:
            setattr(issue, k, v)
            continue
        old = getattr(issue, k, None)
        if _normalize(old) == _normalize(v):
            # No-op change; don't pollute audit log
            setattr(issue, k, v)
            continue

        if k == "status":
            await append_event(
                db,
                type="status_change",
                issue_id=issue.id,
                project_id=project.id,
                payload={"from": _normalize(old), "to": _normalize(v)},
                source="user",
            )
        else:
            await append_event(
                db,
                type="field_changed",
                issue_id=issue.id,
                project_id=project.id,
                payload={
                    "field": k,
                    "from": _normalize(old),
                    "to": _normalize(v),
                },
                source="user",
            )
        setattr(issue, k, v)

    # Notify the new assignee when assignment changes to a real user.
    if "assignee_id" in patch and issue.assignee_id and issue.assignee_id != old_assignee:
        assignee = await db.get(User, issue.assignee_id)
        if assignee:
            db.add(Notification(
                recipient=assignee.username or assignee.email or str(assignee.id),
                type=NotificationType.ASSIGNED,
                title=f"Assigned to {project.key}-{issue.number}",
                body=issue.title,
                project_id=project.id,
                payload={"issue_number": issue.number, "issue_id": str(issue.id)},
            ))

    await db.commit()
    await db.refresh(issue)
    return issue
