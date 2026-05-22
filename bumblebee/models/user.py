"""User entity — commercial v0.4.0 auth requirement."""
from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from bumblebee.models.base import Base, UUIDPKMixin, TimestampMixin


class User(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ApiKey(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "api_keys"

    key_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(200))  # FK string for flexibility
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    scopes: Mapped[list] = mapped_column(__import__("sqlalchemy.dialects.postgresql", fromlist=["JSONB"]).JSONB, default=list, nullable=False)
