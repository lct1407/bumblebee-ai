"""Issue comments — list + create, with @mention notifications."""
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.comment import Comment
from bumblebee.models.issue import Issue
from bumblebee.models.notification import Notification, NotificationType
from bumblebee.models.project import Project
from bumblebee.models.user import User
from bumblebee.models.workspace import WorkspaceMember
from bumblebee.schemas.comment import CommentCreate, CommentOut

router = APIRouter(prefix="/api/projects/{slug}/issues/{number}/comments", tags=["comments"])

_MENTION_RE = re.compile(r"@([A-Za-z0-9_.\-]{1,100})")


async def _resolve(slug: str, number: int, db: AsyncSession) -> tuple[Project, Issue]:
    project = (
        await db.execute(select(Project).where(Project.slug == slug, Project.deleted_at.is_(None)))
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
    return project, issue


@router.get("", response_model=list[CommentOut])
async def list_comments(slug: str, number: int, db: AsyncSession = Depends(get_db)):
    _project, issue = await _resolve(slug, number, db)
    rows = (
        await db.execute(
            select(Comment).where(Comment.issue_id == issue.id).order_by(Comment.created_at.asc())
        )
    ).scalars().all()
    return list(rows)


@router.post("", response_model=CommentOut, status_code=201)
async def create_comment(
    slug: str, number: int, body: CommentCreate, db: AsyncSession = Depends(get_db)
):
    project, issue = await _resolve(slug, number, db)
    comment = Comment(
        body=body.body,
        author=body.author,
        author_user_id=body.author_user_id,
        type=body.type,
        issue_id=issue.id,
    )
    db.add(comment)

    # @mention → notify workspace members referenced by username.
    mentions = {m.lower() for m in _MENTION_RE.findall(body.body)}
    if mentions:
        members = (
            await db.execute(
                select(User)
                .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
                .where(WorkspaceMember.workspace_id == project.workspace_id)
            )
        ).scalars().all()
        for user in members:
            if user.username and user.username.lower() in mentions:
                db.add(Notification(
                    recipient=user.username,
                    type=NotificationType.MENTION,
                    title=f"Mentioned in {project.key}-{issue.number}",
                    body=body.body[:280],
                    project_id=project.id,
                    payload={"issue_number": issue.number, "issue_id": str(issue.id)},
                ))

    await db.commit()
    await db.refresh(comment)
    return comment
