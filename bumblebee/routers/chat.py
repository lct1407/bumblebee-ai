"""ChatSession (Tier 2: Q&A + suggest via HITL)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.agent_session import AgentSession
from bumblebee.models.chat_session import ChatSession, ChatSource
from bumblebee.models.project import Project
from bumblebee.services.execution.harness import run_role
from bumblebee.services.state.event_log import append_event

router = APIRouter(prefix="/api/projects/{slug}/chat", tags=["chat"])


class ChatStartRequest(BaseModel):
    title: str | None = None
    source: ChatSource = ChatSource.WEB
    user_id: str | None = None


class ChatMessageRequest(BaseModel):
    content: str


@router.post("/sessions", status_code=201)
async def start_chat(
    slug: str, body: ChatStartRequest, db: AsyncSession = Depends(get_db)
):
    project = (
        await db.execute(select(Project).where(Project.slug == slug))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "project_not_found")

    chat = ChatSession(
        title=body.title or "New Chat",
        source=body.source,
        user_id=body.user_id,
        project_id=project.id,
        messages=[],
    )
    db.add(chat)
    await db.flush()

    await append_event(
        db,
        type="chat_message",
        chat_session_id=chat.id,
        project_id=project.id,
        payload={"event": "chat_started", "source": body.source.value},
        source="chat",
    )
    await db.commit()
    await db.refresh(chat)
    return {"id": chat.id, "title": chat.title}


@router.post("/sessions/{chat_id}/messages")
async def post_message(
    slug: str,
    chat_id: uuid.UUID,
    body: ChatMessageRequest,
    db: AsyncSession = Depends(get_db),
):
    """Append user message, run Assistant role via harness, append reply."""
    chat = await db.get(ChatSession, chat_id)
    if not chat:
        raise HTTPException(404, "chat_not_found")

    # Append user message
    chat.messages = chat.messages + [{"role": "user", "content": body.content}]

    await append_event(
        db,
        type="chat_message",
        chat_session_id=chat.id,
        project_id=chat.project_id,
        payload={"role": "user", "content": body.content},
        source="user",
    )

    # Run Assistant harness (stub)
    session = AgentSession(
        role="assistant",
        provider="stub",
        chat_session_id=chat.id,
        budget_wall_min=10,
        budget_tokens_max=50_000,
        budget_dollars_max=0.5,
    )
    db.add(session)
    await db.flush()

    result = await run_role(
        db, session=session, role="assistant", input_state={"user_message": body.content}
    )

    reply = result.output.get("reply", "(no reply)")
    chat.messages = chat.messages + [{"role": "assistant", "content": reply}]

    await append_event(
        db,
        type="chat_message",
        chat_session_id=chat.id,
        project_id=chat.project_id,
        session_id=session.id,
        payload={"role": "assistant", "content": reply},
        source="agent",
    )

    await db.commit()
    return {"reply": reply, "session_id": session.id}
