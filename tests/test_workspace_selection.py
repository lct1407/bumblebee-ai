"""Active-workspace selection: X-Workspace header + soft-delete-aware defaults.

GET /api/workspaces/{id} returns 200 only when {id} is the *resolved active*
workspace, so it doubles as a probe for which workspace require_workspace picked.
"""
from __future__ import annotations
import uuid

import pytest

from bumblebee.auth.security import decode_access_token


async def _register(client, suffix: str) -> dict:
    u = f"u_{suffix}_{uuid.uuid4().hex[:6]}"
    resp = await client.post(
        "/api/auth/register",
        json={"username": u, "email": f"{u}@example.com", "password": "secret123!"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    data["_username"] = u
    return data


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_ws(client, token: str, name: str) -> dict:
    resp = await client.post(
        "/api/workspaces", json={"name": name}, headers=_h(token)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_x_workspace_header_switches_active_scope_by_slug(client):
    """X-Workspace (slug) overrides the JWT `ws` claim for request scope."""
    data = await _register(client, "switch_slug")
    token = data["access_token"]
    b = await _create_ws(client, token, "B " + uuid.uuid4().hex[:4])

    # No header → active is the JWT claim (workspace A) → B is not active → 403.
    r = await client.get(f"/api/workspaces/{b['id']}", headers=_h(token))
    assert r.status_code == 403

    # With header → active becomes B → 200.
    r = await client.get(
        f"/api/workspaces/{b['id']}",
        headers={**_h(token), "X-Workspace": b["slug"]},
    )
    assert r.status_code == 200
    assert r.json()["id"] == b["id"]


@pytest.mark.asyncio
async def test_x_workspace_header_accepts_uuid(client):
    """The header also resolves a workspace id, not just a slug."""
    data = await _register(client, "switch_uuid")
    token = data["access_token"]
    b = await _create_ws(client, token, "B " + uuid.uuid4().hex[:4])

    r = await client.get(
        f"/api/workspaces/{b['id']}",
        headers={**_h(token), "X-Workspace": b["id"]},
    )
    assert r.status_code == 200
    assert r.json()["id"] == b["id"]


@pytest.mark.asyncio
async def test_invalid_x_workspace_header_falls_back_to_default(client):
    """An unknown header value is ignored, not a hard error — falls back to the claim."""
    data = await _register(client, "stale")
    token = data["access_token"]
    a_id = data["workspace"]["id"]

    r = await client.get(
        f"/api/workspaces/{a_id}",
        headers={**_h(token), "X-Workspace": "ghost-" + uuid.uuid4().hex[:6]},
    )
    assert r.status_code == 200
    assert r.json()["id"] == a_id


@pytest.mark.asyncio
async def test_x_workspace_header_cannot_escalate_cross_tenant(client):
    """A member of one workspace can't scope into another via the header."""
    alice = await _register(client, "alice_hdr")
    bob = await _register(client, "bob_hdr")

    r = await client.get(
        f"/api/workspaces/{alice['workspace']['id']}",
        headers={
            **_h(bob["access_token"]),
            "X-Workspace": alice["workspace"]["slug"],
        },
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_login_skips_soft_deleted_primary_workspace(client):
    """If the earliest workspace is soft-deleted, login defaults to the next active one."""
    data = await _register(client, "del_primary")
    token = data["access_token"]
    a_id = data["workspace"]["id"]
    b = await _create_ws(client, token, "B " + uuid.uuid4().hex[:4])

    # Delete A (active = A via the JWT claim).
    r = await client.delete(f"/api/workspaces/{a_id}", headers=_h(token))
    assert r.status_code == 204

    # Re-login → default workspace is now B (earliest *active* membership).
    r = await client.post(
        "/api/auth/login",
        json={"username": data["_username"], "password": "secret123!"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["workspace"]["id"] == b["id"]
    assert decode_access_token(body["access_token"])["ws"] == b["id"]


@pytest.mark.asyncio
async def test_x_workspace_header_ignores_soft_deleted_workspace(client):
    """A header pointing at a soft-deleted workspace is ignored (falls back)."""
    data = await _register(client, "del_target")
    token = data["access_token"]
    a_id = data["workspace"]["id"]
    b = await _create_ws(client, token, "B " + uuid.uuid4().hex[:4])

    # Make B active via the header, then delete it.
    r = await client.delete(
        f"/api/workspaces/{b['id']}",
        headers={**_h(token), "X-Workspace": b["slug"]},
    )
    assert r.status_code == 204

    # Header still points at (now-deleted) B → ignored → falls back to claim A.
    r = await client.get(
        f"/api/workspaces/{a_id}",
        headers={**_h(token), "X-Workspace": b["slug"]},
    )
    assert r.status_code == 200
    assert r.json()["id"] == a_id

    # B itself is no longer reachable.
    r = await client.get(
        f"/api/workspaces/{b['id']}",
        headers={**_h(token), "X-Workspace": b["slug"]},
    )
    assert r.status_code == 403
