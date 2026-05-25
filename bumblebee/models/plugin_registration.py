"""PluginRegistration — track installed plugins, status, errors."""
from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from bumblebee.models.base import Base, TimestampMixin, UUIDPKMixin


class PluginRegistration(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "plugin_registrations"

    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    version: Mapped[str | None] = mapped_column(String(50))
    module: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(50), default="loaded", nullable=False)
    # ^ "loaded" | "failed" | "disabled"
    manifest: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    loaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
