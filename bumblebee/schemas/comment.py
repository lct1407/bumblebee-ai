"""Comment schemas."""
import uuid
from datetime import datetime

from pydantic import BaseModel

from bumblebee.models.comment import CommentType


class CommentCreate(BaseModel):
    body: str
    author: str | None = None
    author_user_id: uuid.UUID | None = None
    type: CommentType = CommentType.DISCUSSION


class CommentOut(BaseModel):
    id: uuid.UUID
    body: str
    type: CommentType
    author: str | None
    author_user_id: uuid.UUID | None
    issue_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
