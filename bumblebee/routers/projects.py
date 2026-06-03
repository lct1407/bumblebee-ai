"""Project CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.project import Project
from bumblebee.models.user import User
from bumblebee.models.workspace import WorkspaceMember
from bumblebee.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)) -> list[Project]:
    result = await db.execute(select(Project).where(Project.deleted_at.is_(None)))
    return list(result.scalars().all())


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(body: ProjectCreate, db: AsyncSession = Depends(get_db)) -> Project:
    proj = Project(**body.model_dump())
    db.add(proj)
    await db.commit()
    await db.refresh(proj)
    return proj


@router.get("/{slug}/members")
async def list_project_members(slug: str, db: AsyncSession = Depends(get_db)):
    """Assignable users — members of the workspace that owns this project."""
    project = (
        await db.execute(select(Project).where(Project.slug == slug, Project.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "project_not_found")
    rows = (
        await db.execute(
            select(WorkspaceMember, User)
            .join(User, User.id == WorkspaceMember.user_id)
            .where(WorkspaceMember.workspace_id == project.workspace_id)
        )
    ).all()
    return [
        {
            "user_id": str(m.user_id),
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
            "role": m.role.value,
        }
        for m, u in rows
    ]


@router.get("/{slug}", response_model=ProjectOut)
async def get_project(slug: str, db: AsyncSession = Depends(get_db)) -> Project:
    stmt = select(Project).where(Project.slug == slug, Project.deleted_at.is_(None))
    proj = (await db.execute(stmt)).scalar_one_or_none()
    if not proj:
        raise HTTPException(404, "project_not_found")
    return proj


@router.patch("/{slug}", response_model=ProjectOut)
async def update_project(
    slug: str, body: ProjectUpdate, db: AsyncSession = Depends(get_db)
) -> Project:
    stmt = select(Project).where(Project.slug == slug)
    proj = (await db.execute(stmt)).scalar_one_or_none()
    if not proj:
        raise HTTPException(404, "project_not_found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(proj, k, v)
    await db.commit()
    await db.refresh(proj)
    return proj
