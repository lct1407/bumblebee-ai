"""Auth endpoints — register / login / api-keys."""
from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.auth.dependencies import get_current_user
from bumblebee.auth.security import (
    create_access_token,
    generate_api_key,
    hash_password,
    verify_password,
)
from bumblebee.database import get_db
from bumblebee.models.user import ApiKey, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str  # avoid EmailStr to skip email-validator dep
    username: str
    password: str
    full_name: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class CreateApiKeyRequest(BaseModel):
    name: str


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key: str | None = None  # only on creation
    created_at: str


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = (
        await db.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "username_taken")
    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(str(user.id), extra={"username": user.username})
    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id), "username": user.username,
            "email": user.email, "full_name": user.full_name,
        },
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.username == body.username, User.is_active == True))
    ).scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "invalid_credentials")
    token = create_access_token(str(user.id), extra={"username": user.username})
    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id), "username": user.username,
            "email": user.email, "full_name": user.full_name,
        },
    )


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    if user is None:
        return {"authenticated": False, "auth_enabled": False}
    return {
        "authenticated": True,
        "id": str(user.id) if user.id else None,
        "username": user.username,
        "email": user.email,
        "is_admin": user.is_admin,
    }


@router.post("/api-keys", response_model=ApiKeyResponse, status_code=201)
async def create_api_key(
    body: CreateApiKeyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    raw, h = generate_api_key()
    key = ApiKey(
        key_hash=h,
        name=body.name,
        user_id=str(user.id) if user and user.id else None,
        scopes=[],
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    return ApiKeyResponse(
        id=str(key.id),
        name=key.name,
        key=raw,  # one-time reveal
        created_at=key.created_at.isoformat(),
    )


@router.get("/api-keys")
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(ApiKey)
    if user and user.id:
        stmt = stmt.where(ApiKey.user_id == str(user.id))
    keys = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(k.id),
            "name": k.name,
            "is_active": k.is_active,
            "created_at": k.created_at.isoformat(),
        }
        for k in keys
    ]
