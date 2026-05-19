"""Common Pydantic schemas."""
import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    """Base for ORM-derived schemas."""
    model_config = ConfigDict(from_attributes=True)


class TimestampedModel(ORMModel):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
