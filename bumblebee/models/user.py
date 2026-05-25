"""User entity — commercial v0.4.0 auth requirement."""
from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from bumblebee.models.base import Base, TimestampMixin, UUIDPKMixin


class User(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    # Nullable when user only has an OAuth identity (Phase: Google OAuth)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # OAuth linkage (one row per (provider, sub) pair; future: separate identities table)
    oauth_provider: Mapped[str | None] = mapped_column(String(50))   # 'google' / 'github' / ...
    oauth_sub: Mapped[str | None] = mapped_column(String(255))       # provider's stable user id
    avatar_url: Mapped[str | None] = mapped_column(String(500))


class ApiKey(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "api_keys"

    key_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(200))  # FK string for flexibility
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    scopes: Mapped[list] = mapped_column(__import__("sqlalchemy.dialects.postgresql", fromlist=["JSONB"]).JSONB, default=list, nullable=False)
