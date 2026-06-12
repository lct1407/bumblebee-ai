"""Auth tests — register, login, API key, /me."""
import os
from unittest.mock import patch

import pytest


@pytest.mark.asyncio
async def test_register_and_login(client, clean_db):
    """Full register → login → /me flow."""
    # Register
    r = await client.post(
        "/api/auth/register",
        json={
            "email": "user@example.com",
            "username": "tester",
            "password": "secret123",
            "full_name": "Test User",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["access_token"]
    assert data["user"]["username"] == "tester"

    token = data["access_token"]

    # /me with bearer
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    me_data = me.json()
    # When AUTH off (default test env) → authenticated False
    # When AUTH on → authenticated True
    if me_data.get("auth_enabled") is False:
        assert me_data["authenticated"] is False
    else:
        assert me_data["authenticated"] is True
        assert me_data["username"] == "tester"

    # Login same creds
    login = await client.post(
        "/api/auth/login",
        json={"username": "tester", "password": "secret123"},
    )
    assert login.status_code == 200
    assert login.json()["access_token"]


@pytest.mark.asyncio
async def test_register_duplicate_rejected(client, clean_db):
    r1 = await client.post(
        "/api/auth/register",
        json={"email": "a@b.com", "username": "alice", "password": "pw1234"},
    )
    assert r1.status_code == 201
    r2 = await client.post(
        "/api/auth/register",
        json={"email": "z@b.com", "username": "alice", "password": "pw1234"},
    )
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_login_accepts_email_as_identifier(client, clean_db):
    await client.post(
        "/api/auth/register",
        json={"email": "mail-login@example.com", "username": "maillogin", "password": "pw1234"},
    )
    by_email = await client.post(
        "/api/auth/login",
        json={"username": "mail-login@example.com", "password": "pw1234"},
    )
    assert by_email.status_code == 200
    assert by_email.json()["user"]["username"] == "maillogin"

    by_username = await client.post(
        "/api/auth/login", json={"username": "maillogin", "password": "pw1234"},
    )
    assert by_username.status_code == 200


@pytest.mark.asyncio
async def test_login_invalid_credentials(client, clean_db):
    await client.post(
        "/api/auth/register",
        json={"email": "x@y.com", "username": "u1", "password": "good"},
    )
    bad = await client.post(
        "/api/auth/login", json={"username": "u1", "password": "wrong"},
    )
    assert bad.status_code == 401


@pytest.mark.asyncio
async def test_api_key_creation_returns_one_time_secret(client, clean_db):
    # Register + login
    reg = await client.post(
        "/api/auth/register",
        json={"email": "k@k.com", "username": "keyowner", "password": "pw1234"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.post("/api/auth/api-keys", json={"name": "ci-token"}, headers=headers)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "ci-token"
    assert body["key"].startswith("bb_")  # one-time reveal

    listing = await client.get("/api/auth/api-keys", headers=headers)
    assert listing.status_code == 200
    keys = listing.json()
    assert any(k["name"] == "ci-token" for k in keys)


def test_password_hashing_irreversible():
    from bumblebee.auth.security import hash_password, verify_password
    h = hash_password("secret123")
    assert h != "secret123"
    assert verify_password("secret123", h)
    assert not verify_password("wrong", h)


def test_jwt_roundtrip():
    from bumblebee.auth.security import create_access_token, decode_access_token
    token = create_access_token("user-uuid", extra={"username": "u"})
    decoded = decode_access_token(token)
    assert decoded["sub"] == "user-uuid"
    assert decoded["username"] == "u"


def test_api_key_generation():
    from bumblebee.auth.security import generate_api_key, hash_api_key
    raw, h = generate_api_key()
    assert raw.startswith("bb_")
    assert len(h) == 64  # SHA-256 hex
    assert hash_api_key(raw) == h
