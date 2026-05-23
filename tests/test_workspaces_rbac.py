"""Phase A — workspace + RBAC E2E tests.

Coverage:
- register creates workspace + owner membership
- JWT carries ws + role claims
- list workspaces returns mine only
- create additional workspace
- invite + accept flow
- cross-workspace 403 (never 404 — no existence leak)
- owner cannot be self-removed
- invite cannot grant owner role
- /api/auth/me returns user's workspaces

Uses the shared `client` fixture from conftest.py (handles asyncpg event-loop
lifecycle on Windows). Each test uses unique usernames so no per-test truncate
is required.
"""
from __future__ import annotations
import uuid

import pytest

from bumblebee.auth.security import decode_access_token


async def _register(client, suffix: str, email: str | None = None) -> dict:
    """Register a user with a unique suffix, return token payload."""
    u = f"u_{suffix}_{uuid.uuid4().hex[:6]}"
    resp = await client.post(
        "/api/auth/register",
        json={
            "username": u,
            "email": email or f"{u}@example.com",
            "password": "secret123!",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    data["_username"] = u
    return data


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_register_creates_workspace_with_owner_role(client):
    data = await _register(client, "ws_owner")
    assert data["workspace"]["role"] == "owner"
    assert data["workspace"]["slug"]
    payload = decode_access_token(data["access_token"])
    assert payload["ws"] == data["workspace"]["id"]
    assert payload["role"] == "owner"


@pytest.mark.asyncio
async def test_list_my_workspaces(client):
    data = await _register(client, "ws_list")
    resp = await client.get("/api/workspaces", headers=_headers(data["access_token"]))
    assert resp.status_code == 200
    rows = resp.json()
    # At least the just-created workspace
    slugs = [r["slug"] for r in rows]
    assert data["workspace"]["slug"] in slugs


@pytest.mark.asyncio
async def test_create_additional_workspace(client):
    data = await _register(client, "ws_extra")
    resp = await client.post(
        "/api/workspaces",
        json={"name": "Side Project " + uuid.uuid4().hex[:4]},
        headers=_headers(data["access_token"]),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["role"] == "owner"


@pytest.mark.asyncio
async def test_cross_workspace_returns_403_not_404(client):
    """Accessing another user's workspace must 403 — must not leak existence."""
    alice = await _register(client, "alice_iso")
    bob = await _register(client, "bob_iso")

    resp = await client.get(
        f"/api/workspaces/{alice['workspace']['id']}",
        headers=_headers(bob["access_token"]),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_invite_flow_makes_user_a_member(client):
    owner = await _register(client, "ow_inv")
    ws_id = owner["workspace"]["id"]
    invitee_email = f"invitee_{uuid.uuid4().hex[:6]}@example.com"

    inv = await client.post(
        f"/api/workspaces/{ws_id}/invites",
        json={"email": invitee_email, "role": "member"},
        headers=_headers(owner["access_token"]),
    )
    assert inv.status_code == 201, inv.text
    token = inv.json()["token"]

    preview = await client.get(f"/api/invites/{token}")
    assert preview.status_code == 200
    assert preview.json()["role"] == "member"

    invitee = await _register(client, "newbie", email=invitee_email)
    accept = await client.post(
        f"/api/invites/{token}/accept",
        headers=_headers(invitee["access_token"]),
    )
    assert accept.status_code == 200
    assert accept.json()["workspace_id"] == ws_id

    members = await client.get(
        f"/api/workspaces/{ws_id}/members",
        headers=_headers(owner["access_token"]),
    )
    assert members.status_code == 200
    roles = {m["username"]: m["role"] for m in members.json()}
    assert roles[owner["_username"]] == "owner"
    assert roles[invitee["_username"]] == "member"


@pytest.mark.asyncio
async def test_cannot_remove_workspace_owner(client):
    owner = await _register(client, "ow_self_rm")
    ws_id = owner["workspace"]["id"]
    user_id = owner["user"]["id"]
    resp = await client.delete(
        f"/api/workspaces/{ws_id}/members/{user_id}",
        headers=_headers(owner["access_token"]),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_invite_cannot_grant_owner_role(client):
    owner = await _register(client, "ow_inv_block")
    ws_id = owner["workspace"]["id"]
    resp = await client.post(
        f"/api/workspaces/{ws_id}/invites",
        json={"email": "x@example.com", "role": "owner"},
        headers=_headers(owner["access_token"]),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_me_returns_user_workspaces(client):
    data = await _register(client, "me_ws")
    await client.post(
        "/api/workspaces",
        json={"name": "Second " + uuid.uuid4().hex[:4]},
        headers=_headers(data["access_token"]),
    )
    resp = await client.get("/api/auth/me", headers=_headers(data["access_token"]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["authenticated"] is True
    owned = [w for w in body["workspaces"] if w["role"] == "owner"]
    assert len(owned) >= 2  # primary + the second created above


@pytest.mark.asyncio
async def test_invalid_invite_token_returns_404(client):
    resp = await client.get("/api/invites/notarealtoken")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_non_member_cannot_invite(client):
    """Bob cannot send invites in Alice's workspace."""
    alice = await _register(client, "alice_perms")
    bob = await _register(client, "bob_perms")
    resp = await client.post(
        f"/api/workspaces/{alice['workspace']['id']}/invites",
        json={"email": "x@example.com", "role": "member"},
        headers=_headers(bob["access_token"]),
    )
    assert resp.status_code == 403
