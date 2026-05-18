"""Project CRUD."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models.project import Project
from src.schemas.project import ProjectCreate, ProjectUpdate, ProjectOut

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
