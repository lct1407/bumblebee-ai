"""Issue schemas."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from bumblebee.models.issue import IssueComplexity, IssuePriority, IssueStatus, IssueType
from bumblebee.schemas.common import TimestampedModel


class IssueCreate(BaseModel):
    title: str
    description: str | None = None
    type: IssueType = IssueType.TASK
    priority: IssuePriority = IssuePriority.NONE
    parent_id: uuid.UUID | None = None
    acceptance_criteria: str | None = None
    scope_hints: list[str] = Field(default_factory=list)
    # Collaboration + progress
    assignee_id: uuid.UUID | None = None
    reporter_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    estimate: int | None = None


class IssueUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: IssueStatus | None = None
    priority: IssuePriority | None = None
    complexity: IssueComplexity | None = None
    acceptance_criteria: str | None = None
    scope_hints: list[str] | None = None
    ai_confidence: float | None = None
    # Collaboration + progress
    assignee_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    estimate: int | None = None


class IssueOut(TimestampedModel):
    number: int
    title: str
    description: str | None
    type: IssueType
    status: IssueStatus
    priority: IssuePriority
    complexity: IssueComplexity | None
    ai_summary: str | None
    ai_suggested_solution: str | None
    ai_confidence: float | None
    acceptance_criteria: str | None
    scope_hints: list
    project_id: uuid.UUID
    parent_id: uuid.UUID | None
    # Collaboration + progress
    assignee_id: uuid.UUID | None
    reporter_id: uuid.UUID | None
    milestone_id: uuid.UUID | None
    start_date: datetime | None
    due_date: datetime | None
    estimate: int | None
