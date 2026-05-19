"""Test: ChatSession Tier 2 flow."""
import pytest


@pytest.mark.asyncio
async def test_chat_start_and_message(client, clean_db):
    r = await client.post(
        "/api/projects/bb/chat/sessions",
        json={"title": "test", "source": "cli"},
    )
    assert r.status_code == 201
    chat_id = r.json()["id"]

    r2 = await client.post(
        f"/api/projects/bb/chat/sessions/{chat_id}/messages",
        json={"content": "hi"},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert "reply" in body
    assert "session_id" in body
    # Stub assistant returns canned reply
    assert "stub assistant" in body["reply"]


@pytest.mark.asyncio
async def test_chat_events_logged(client, clean_db):
    r = await client.post(
        "/api/projects/bb/chat/sessions",
        json={"title": "t2", "source": "cli"},
    )
    chat_id = r.json()["id"]
    await client.post(
        f"/api/projects/bb/chat/sessions/{chat_id}/messages",
        json={"content": "hello"},
    )

    # Verify 3 chat_message events: chat_started + user + assistant
    events = (await client.get("/api/events?type=chat_message&limit=10")).json()
    types_chat = [(e["payload"].get("role"), e["payload"].get("event")) for e in events]
    # ordering desc; we expect events of: assistant, user, chat_started
    assert any(p == ("assistant", None) for p in types_chat)
    assert any(p == ("user", None) for p in types_chat)
    assert any(p == (None, "chat_started") for p in types_chat)


@pytest.mark.asyncio
async def test_chat_404_unknown_session(client):
    r = await client.post(
        "/api/projects/bb/chat/sessions/00000000-0000-0000-0000-000000000000/messages",
        json={"content": "x"},
    )
    assert r.status_code == 404
