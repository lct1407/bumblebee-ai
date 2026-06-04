"""Streamable HTTP transport for the MCP server (for Claude Code / Cursor / web agents).

API key is extracted from the `Authorization: Bearer <key>` header per request.
The server uses the official mcp SDK's HTTP transport.
"""
from __future__ import annotations
import logging

import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request

log = logging.getLogger(__name__)


def build_app() -> FastAPI:
    """Build a minimal FastAPI app that exposes the MCP server over HTTP."""
    app = FastAPI(title="Bumblebee MCP", version="0.1.0")

    @app.get("/healthz")
    @app.get("/mcp/healthz")
    async def healthz():
        return {"ok": True, "transport": "mcp-http"}

    @app.get("/mcp/tools")
    async def list_tools_endpoint():
        """Discovery endpoint — non-MCP, useful for humans to verify wiring."""
        from bumblebee_mcp.tools import TOOLS
        return [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
                "required_permission": t.required_permission.value,
            }
            for t in TOOLS
        ]

    @app.post("/mcp/call")
    async def call_tool_endpoint(
        request: Request,
        authorization: str | None = Header(None),
    ):
        """Plain-JSON tool invocation (simplified — full MCP transport TODO Phase B-final)."""
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "missing_bearer_token")
        api_key = authorization[len("Bearer "):].strip()

        body = await request.json()
        name = body.get("name")
        args = body.get("arguments") or {}
        if not name:
            raise HTTPException(400, "missing 'name'")

        from bumblebee.database import SessionLocal
        from bumblebee_mcp.auth import McpAuthError, resolve_api_key
        from bumblebee_mcp.tools import dispatch

        async with SessionLocal() as db:
            try:
                ctx = await resolve_api_key(db, api_key)
            except McpAuthError as e:
                raise HTTPException(401, f"auth_failed: {e}")
            try:
                result = await dispatch(db, ctx, name, args)
            except PermissionError as e:
                raise HTTPException(403, str(e))
            except ValueError as e:
                raise HTTPException(400, str(e))
            return {"name": name, "result": result}

    return app


async def serve_http(host: str = "127.0.0.1", port: int = 8080) -> None:
    """Run the HTTP MCP server."""
    config = uvicorn.Config(
        build_app(),
        host=host,
        port=port,
        log_level="info",
        access_log=False,
    )
    server = uvicorn.Server(config)
    await server.serve()
