"""Event schemas."""
import uuid
from datetime import datetime

from pydantic import BaseModel

from bumblebee.schemas.common import ORMModel


class EventCreate(BaseModel):
    type: str
    payload: dict = {}
    project_id: uuid.UUID | None = None
    issue_id: uuid.UUID | None = None
    session_id: uuid.UUID | None = None
    chat_session_id: uuid.UUID | None = None
    workflow_run_id: uuid.UUID | None = None
    causation_id: uuid.UUID | None = None
    source: str = "system"
    actor: str | None = None
    prompt_hash: str | None = None


class EventOut(ORMModel):
    id: uuid.UUID
    type: str
    payload: dict
    project_id: uuid.UUID | None
    issue_id: uuid.UUID | None
    session_id: uuid.UUID | None
    source: str
    actor: str | None
    occurred_at: datetime
