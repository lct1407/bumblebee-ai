"""FastAPI auth dependencies — accept JWT Bearer OR X-BB-API-Key."""
from __future__ import annotations
import os

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.auth.security import decode_access_token, hash_api_key
from bumblebee.database import get_db
from bumblebee.models.user import ApiKey, User


# Allow disabling auth entirely for dev (BUMBLEBEE_AUTH=off).
AUTH_ENABLED = os.environ.get("BUMBLEBEE_AUTH", "on").lower() != "off"


async def get_current_user(
    authorization: str | None = Header(None),
    x_bb_api_key: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Auth dependency. None if auth disabled. Raises 401 if auth enabled but missing/invalid."""
    if not AUTH_ENABLED:
        return None

    # 1) Try JWT Bearer
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        payload = decode_access_token(token)
        if payload and (sub := payload.get("sub")):
            user = (
                await db.execute(select(User).where(User.id == sub, User.is_active == True))
            ).scalar_one_or_none()
            if user:
                return user

    # 2) Try API key
    if x_bb_api_key:
        h = hash_api_key(x_bb_api_key)
        key = (
            await db.execute(
                select(ApiKey).where(ApiKey.key_hash == h, ApiKey.is_active == True)
            )
        ).scalar_one_or_none()
        if key:
            if key.user_id:
                user = (
                    await db.execute(select(User).where(User.id == key.user_id))
                ).scalar_one_or_none()
                if user:
                    return user
            # API key without user binding — return a synthetic admin
            return User(
                email=f"apikey-{key.id}",
                username=key.name,
                password_hash="",
                is_admin=True,
                is_active=True,
            )

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "auth required")


async def get_current_user_optional(
    authorization: str | None = Header(None),
    x_bb_api_key: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Like get_current_user but returns None instead of 401."""
    try:
        return await get_current_user(authorization, x_bb_api_key, db)
    except HTTPException:
        return None
