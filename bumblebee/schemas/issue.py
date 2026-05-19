"""Issue schemas."""
import uuid
from pydantic import BaseModel, Field

from bumblebee.models.issue import IssueType, IssueStatus, IssuePriority, IssueComplexity
from bumblebee.schemas.common import TimestampedModel


class IssueCreate(BaseModel):
    title: str
    description: str | None = None
    type: IssueType = IssueType.TASK
    priority: IssuePriority = IssuePriority.NONE
    parent_id: uuid.UUID | None = None
    acceptance_criteria: str | None = None
    scope_hints: list[str] = Field(default_factory=list)


class IssueUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: IssueStatus | None = None
    priority: IssuePriority | None = None
    complexity: IssueComplexity | None = None
    acceptance_criteria: str | None = None
    scope_hints: list[str] | None = None
    ai_confidence: float | None = None


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
