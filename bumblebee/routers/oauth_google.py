"""Google OAuth 2.0 sign-in flow.

  GET  /api/auth/google/start     -> 302 redirect to Google consent screen
  GET  /api/auth/google/callback  -> exchange code, upsert user, mint JWT, redirect to web

Setup (operator):
  1. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID
  2. Application type: Web application
  3. Authorized redirect URI: http://localhost:8000/api/auth/google/callback (dev)
                              https://api.bumblebee.example.com/api/auth/google/callback (prod)
  4. Copy Client ID + Secret into .env:
       GOOGLE_CLIENT_ID=...
       GOOGLE_CLIENT_SECRET=...
  5. Restart API server.

The frontend "Sign in with Google" button just navigates to /api/auth/google/start;
this router does the rest and ends with a redirect to /onboard or /dashboard
with the JWT in the URL fragment (so it never leaks to server logs).
"""
from __future__ import annotations

import logging
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.auth.security import create_access_token
from bumblebee.config import get_settings
from bumblebee.database import get_db
from bumblebee.models.user import User
from bumblebee.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from bumblebee.routers.auth import (
    _build_token_payload,
    _resolve_primary_membership,
    _slugify,
    _unique_slug,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/google", tags=["oauth"])

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo"

# Per-process CSRF state set. Production: persist to Redis with TTL.
_OAUTH_STATE: set[str] = set()
_MAX_STATE = 5_000


def _track_state(state: str) -> None:
    if len(_OAUTH_STATE) > _MAX_STATE:
        for s in list(_OAUTH_STATE)[: _MAX_STATE // 2]:
            _OAUTH_STATE.discard(s)
    _OAUTH_STATE.add(state)


def _consume_state(state: str) -> bool:
    if state not in _OAUTH_STATE:
        return False
    _OAUTH_STATE.discard(state)
    return True


def _require_configured() -> None:
    s = get_settings()
    if not (s.google_client_id and s.google_client_secret):
        raise HTTPException(
            503,
            "google_oauth_not_configured: set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env",
        )


@router.get("/start")
async def google_start():
    """Begin OAuth flow → redirect user to Google consent."""
    _require_configured()
    s = get_settings()
    state = secrets.token_urlsafe(32)
    _track_state(state)
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": s.google_oauth_redirect_url,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": state,
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH}?{urlencode(params)}")


@router.get("/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Receive Google's redirect, exchange code, upsert user, mint JWT, redirect to web."""
    s = get_settings()

    if error:
        return RedirectResponse(f"{s.web_base_url}/login?error={error}")
    if not code or not state:
        raise HTTPException(400, "missing_code_or_state")
    if not _consume_state(state):
        raise HTTPException(400, "invalid_or_expired_state")
    _require_configured()

    # 1) Exchange auth code → tokens
    async with httpx.AsyncClient(timeout=15.0) as cx:
        token_resp = await cx.post(GOOGLE_TOKEN, data={
            "code": code,
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret,
            "redirect_uri": s.google_oauth_redirect_url,
            "grant_type": "authorization_code",
        })
        if token_resp.status_code != 200:
            log.warning("google token exchange failed: %s", token_resp.text[:200])
            raise HTTPException(401, "token_exchange_failed")
        tokens = token_resp.json()
        access_token = tokens.get("access_token")

        # 2) Fetch profile
        profile_resp = await cx.get(
            GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if profile_resp.status_code != 200:
            raise HTTPException(401, "profile_fetch_failed")
        profile = profile_resp.json()

    google_sub = profile.get("sub")
    email = (profile.get("email") or "").lower().strip()
    name = profile.get("name") or email.split("@")[0]
    avatar = profile.get("picture")
    if not google_sub or not email:
        raise HTTPException(400, "google_returned_no_identity")

    # 3) Upsert user: prefer match by (provider, sub); fallback to email; else create
    user = (
        await db.execute(
            select(User).where(
                User.oauth_provider == "google", User.oauth_sub == google_sub
            )
        )
    ).scalar_one_or_none()
    if not user:
        user = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
    if user:
        # Link OAuth identity to existing email-based account (idempotent)
        user.oauth_provider = "google"
        user.oauth_sub = google_sub
        user.avatar_url = avatar
        if not user.full_name:
            user.full_name = name
        await db.flush()
        was_created = False
    else:
        # Brand-new user — generate a username from email local-part (unique-ified)
        base_username = _slugify(email.split("@")[0]) or "user"
        username = base_username
        i = 2
        while (await db.execute(select(User).where(User.username == username))).scalar_one_or_none():
            username = f"{base_username}{i}"
            i += 1
        user = User(
            email=email,
            username=username,
            password_hash=None,
            full_name=name,
            oauth_provider="google",
            oauth_sub=google_sub,
            avatar_url=avatar,
        )
        db.add(user)
        await db.flush()
        was_created = True

    # 4) For brand-new users, also auto-create a workspace + owner membership
    member = await _resolve_primary_membership(db, user.id)
    if not member:
        ws_name = f"{user.full_name or user.username}'s workspace"
        ws_slug = await _unique_slug(db, _slugify(ws_name))
        ws = Workspace(name=ws_name, slug=ws_slug, owner_user_id=user.id)
        db.add(ws)
        await db.flush()
        member = WorkspaceMember(
            workspace_id=ws.id, user_id=user.id, role=WorkspaceRole.OWNER
        )
        db.add(member)
        await db.flush()
    await db.commit()
    await db.refresh(user)
    await db.refresh(member)

    # 5) Mint JWT + redirect to web with token + workspace in URL fragment.
    # Fragment is never sent to server, so token doesn't hit access logs.
    token = create_access_token(str(user.id), extra=_build_token_payload(user, member))
    ws = await db.get(Workspace, member.workspace_id)
    fragment = urlencode({
        "token": token,
        "ws_slug": ws.slug if ws else "",
        "new": "1" if was_created else "0",
    })
    return RedirectResponse(f"{s.web_base_url}/auth/google/complete#{fragment}")
