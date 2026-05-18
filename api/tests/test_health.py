"""Smoke: health endpoints."""
import pytest


@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "bumblebee-api"


@pytest.mark.asyncio
async def test_health_db(client):
    r = await client.get("/health/db")
    assert r.status_code == 200
    assert r.json()["db"] == "ok"
