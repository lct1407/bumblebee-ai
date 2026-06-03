"""Milestone schemas."""
import uuid
from datetime import datetime

from pydantic import BaseModel

from bumblebee.models.milestone import MilestoneStatus
from bumblebee.schemas.common import TimestampedModel


class MilestoneCreate(BaseModel):
    name: str
    description: str | None = None
    status: MilestoneStatus = MilestoneStatus.PLANNED
    start_date: datetime | None = None
    due_date: datetime | None = None


class MilestoneUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: MilestoneStatus | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None


class MilestoneOut(TimestampedModel):
    name: str
    description: str | None
    status: MilestoneStatus
    start_date: datetime | None
    due_date: datetime | None
    project_id: uuid.UUID
    # Progress (computed at query time)
    total_issues: int = 0
    done_issues: int = 0
    progress_pct: int = 0
