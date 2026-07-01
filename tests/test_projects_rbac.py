"""Projects router — workspace RBAC tests.

Coverage:
- Unauthenticated request returns 401/403
- Viewer can list/get but cannot create/update/delete (enforced via workspace-scoped token)
- Admin can create/update/delete
- Cross-workspace slug returns 404 (scoped by workspace_id)
- Create auto-fills workspace_id from RBAC context
- Duplicate slug/key within workspace returns 409
- DELETE soft-deletes (204) and hides project from list
- Key is uppercased on create

Note on RBAC scope resolution:
  The JWT carries a `ws` claim. `require_workspace` resolves the workspace from that
  claim. When a user registers, their JWT is scoped to their own workspace (where they
  are owner). To test that a *viewer* in workspace W gets 403 on write operations, we
  need a user whose JWT is scoped to W with role=viewer.

  We achieve this via clean_db + direct DB inserts: create a user with no personal
  workspace so their earliest-joined workspace is the target workspace, giving
  `require_workspace` fallback the correct scope.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text


# ---------- helpers ----------

async def _register(client, suffix: str) -> dict:
    u = f"u_{suffix}_{uuid.uuid4().hex[:6]}"
    resp = await client.post(
        "/api/auth/register",
        json={"username": u, "email": f"{u}@example.com", "password": "secret123!"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client, token: str, suffix: str | None = None) -> dict:
    s = suffix or uuid.uuid4().hex[:8]
    resp = await client.post(
        "/api/projects",
        json={
            "name": f"Project {s}",
            "slug": f"proj-{s}",
            "key": s[:6].upper(),
            "description": "test",
            "base_branch": "main",
        },
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_user_with_role(db, ws_id: uuid.UUID, role: str, suffix: str) -> dict:
    """Insert a user + workspace_member row directly — no personal workspace created.

    Because this user has no personal workspace, `require_workspace` fallback resolves
    to the given workspace (earliest-joined = only membership). This lets us test
    role-based access without a workspace-switch endpoint.
    """
    from bumblebee.auth.security import hash_password, create_access_token
    uid = uuid.uuid4()
    uname = f"rbac_{role}_{suffix}_{uuid.uuid4().hex[:6]}"
    await db.execute(
        text(
            "INSERT INTO users (id, email, username, password_hash, is_active, is_admin, created_at, updated_at) "
            "VALUES (:id, :email, :username, :pw, true, false, now(), now())"
        ),
        {"id": uid, "email": f"{uname}@example.com", "username": uname, "pw": hash_password("pw")},
    )
    await db.execute(
        text(
            "INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at, updated_at) "
            "VALUES (gen_random_uuid(), :ws, :uid, :role, now(), now())"
        ),
        {"ws": ws_id, "uid": uid, "role": role},
    )
    await db.commit()

    from bumblebee.models.workspace import WorkspaceMember as WM
    token = create_access_token(str(uid), extra={"username": uname})
    return {"token": token, "user_id": str(uid)}


# ---------- auth guard ----------

@pytest.mark.asyncio
async def test_list_projects_requires_auth(client):
    resp = await client.get("/api/projects")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_project_requires_auth(client):
    resp = await client.post(
        "/api/projects",
        json={"name": "X", "slug": "x", "key": "X"},
    )
    assert resp.status_code in (401, 403)


# ---------- viewer permissions (RBAC scope via DB fixture) ----------

@pytest.mark.asyncio
async def test_viewer_can_list_projects(client, clean_db):
    owner = await _register(client, "vw_list_owner")
    ws_id = uuid.UUID(owner["workspace"]["id"])
    await _create_project(client, owner["access_token"])

    viewer = await _create_user_with_role(clean_db, ws_id, "viewer", "list")

    resp = await client.get("/api/projects", headers=_auth(viewer["token"]))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_viewer_cannot_create_project(client, clean_db):
    owner = await _register(client, "vw_crt_owner")
    ws_id = uuid.UUID(owner["workspace"]["id"])
    viewer = await _create_user_with_role(clean_db, ws_id, "viewer", "crt")

    resp = await client.post(
        "/api/projects",
        json={"name": "X", "slug": f"x-{uuid.uuid4().hex[:6]}", "key": "XTEST"},
        headers=_auth(viewer["token"]),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_update_project(client, clean_db):
    owner = await _register(client, "vw_upd_owner")
    ws_id = uuid.UUID(owner["workspace"]["id"])
    proj = await _create_project(client, owner["access_token"])
    viewer = await _create_user_with_role(clean_db, ws_id, "viewer", "upd")

    resp = await client.patch(
        f"/api/projects/{proj['slug']}",
        json={"description": "hacked"},
        headers=_auth(viewer["token"]),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_delete_project(client, clean_db):
    owner = await _register(client, "vw_del_owner")
    ws_id = uuid.UUID(owner["workspace"]["id"])
    proj = await _create_project(client, owner["access_token"])
    viewer = await _create_user_with_role(clean_db, ws_id, "viewer", "del")

    resp = await client.delete(
        f"/api/projects/{proj['slug']}",
        headers=_auth(viewer["token"]),
    )
    assert resp.status_code == 403


# ---------- admin permissions ----------

@pytest.mark.asyncio
async def test_admin_can_create_project(client, clean_db):
    owner = await _register(client, "adm_crt_owner")
    ws_id = uuid.UUID(owner["workspace"]["id"])
    admin = await _create_user_with_role(clean_db, ws_id, "admin", "crt")

    s = uuid.uuid4().hex[:8]
    resp = await client.post(
        "/api/projects",
        json={"name": f"Admin Proj {s}", "slug": f"ap-{s}", "key": s[:6].upper()},
        headers=_auth(admin["token"]),
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == f"ap-{s}"


@pytest.mark.asyncio
async def test_admin_can_update_project(client, clean_db):
    owner = await _register(client, "adm_upd_owner")
    ws_id = uuid.UUID(owner["workspace"]["id"])
    proj = await _create_project(client, owner["access_token"])
    admin = await _create_user_with_role(clean_db, ws_id, "admin", "upd")

    resp = await client.patch(
        f"/api/projects/{proj['slug']}",
        json={"description": "updated by admin"},
        headers=_auth(admin["token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "updated by admin"


@pytest.mark.asyncio
async def test_owner_can_delete_project(client):
    owner = await _register(client, "own_delete")
    proj = await _create_project(client, owner["access_token"])

    resp = await client.delete(
        f"/api/projects/{proj['slug']}",
        headers=_auth(owner["access_token"]),
    )
    assert resp.status_code == 204

    list_resp = await client.get("/api/projects", headers=_auth(owner["access_token"]))
    slugs = [p["slug"] for p in list_resp.json()]
    assert proj["slug"] not in slugs


# ---------- workspace scoping ----------

@pytest.mark.asyncio
async def test_cross_workspace_project_returns_404(client):
    """Alice's project slug is invisible to Bob (different workspace)."""
    alice = await _register(client, "xws_alice")
    proj = await _create_project(client, alice["access_token"])

    bob = await _register(client, "xws_bob")

    resp = await client.get(
        f"/api/projects/{proj['slug']}",
        headers=_auth(bob["access_token"]),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_auto_fills_workspace_id(client):
    owner = await _register(client, "ws_fill")
    proj = await _create_project(client, owner["access_token"])

    resp = await client.get("/api/projects", headers=_auth(owner["access_token"]))
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()]
    assert proj["slug"] in slugs

    # Another workspace owner cannot see it
    other = await _register(client, "ws_fill_other")
    resp2 = await client.get("/api/projects", headers=_auth(other["access_token"]))
    other_slugs = [p["slug"] for p in resp2.json()]
    assert proj["slug"] not in other_slugs


# ---------- conflict detection ----------

@pytest.mark.asyncio
async def test_duplicate_slug_within_workspace_returns_409(client):
    owner = await _register(client, "dup_slug")
    s = uuid.uuid4().hex[:8]
    body = {"name": "Dup", "slug": f"dup-{s}", "key": f"D{s[:4].upper()}"}

    r1 = await client.post("/api/projects", json=body, headers=_auth(owner["access_token"]))
    assert r1.status_code == 201

    r2 = await client.post(
        "/api/projects",
        json={**body, "key": "DIFF1"},  # same slug, different key
        headers=_auth(owner["access_token"]),
    )
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_duplicate_key_within_workspace_returns_409(client):
    owner = await _register(client, "dup_key")
    s = uuid.uuid4().hex[:8]
    key = s[:5].upper()

    r1 = await client.post(
        "/api/projects",
        json={"name": "K1", "slug": f"k1-{s}", "key": key},
        headers=_auth(owner["access_token"]),
    )
    assert r1.status_code == 201

    r2 = await client.post(
        "/api/projects",
        json={"name": "K2", "slug": f"k2-{s}", "key": key},  # same key, different slug
        headers=_auth(owner["access_token"]),
    )
    assert r2.status_code == 409


# ---------- deterministic ordering ----------

@pytest.mark.asyncio
async def test_list_projects_ordered_by_created_at(client):
    """List returns projects earliest-created first, so the client's default is stable."""
    owner = await _register(client, "proj_order")
    p1 = await _create_project(client, owner["access_token"])
    p2 = await _create_project(client, owner["access_token"])

    resp = await client.get("/api/projects", headers=_auth(owner["access_token"]))
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()]
    assert p1["slug"] in slugs and p2["slug"] in slugs
    assert slugs.index(p1["slug"]) < slugs.index(p2["slug"])


# ---------- key normalisation ----------

@pytest.mark.asyncio
async def test_key_is_uppercased_on_create(client):
    owner = await _register(client, "key_upper")
    s = uuid.uuid4().hex[:6]
    resp = await client.post(
        "/api/projects",
        json={"name": "Lower", "slug": f"lower-{s}", "key": s.lower()},
        headers=_auth(owner["access_token"]),
    )
    assert resp.status_code == 201
    assert resp.json()["key"] == s.upper()
