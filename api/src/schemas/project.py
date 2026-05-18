"""Project schemas."""
from pydantic import BaseModel, Field

from src.schemas.common import TimestampedModel


class ProjectCreate(BaseModel):
    name: str
    slug: str
    key: str = Field(max_length=10)
    description: str | None = None
    repo_path: str | None = None
    base_branch: str = "main"


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    repo_path: str | None = None
    base_branch: str | None = None
    policy_config: dict | None = None
    deploy_config: dict | None = None


class ProjectOut(TimestampedModel):
    name: str
    slug: str
    key: str
    description: str | None
    repo_path: str | None
    base_branch: str
    policy_config: dict
    deploy_config: dict
    observability_config: dict
    enabled: bool
