"""MCP server factory — registers all tools + handles dispatch.

Both stdio and HTTP transports share this server instance.
"""
from __future__ import annotations
import json
import logging
import os
from typing import Any

from mcp.server import Server
from mcp.types import TextContent, Tool

from bumblebee.database import SessionLocal
from bumblebee_mcp.auth import McpAuthContext, McpAuthError, resolve_api_key
from bumblebee_mcp.tools import TOOLS, dispatch


def _db_session():
    """Async context manager that yields an AsyncSession (mirrors get_db pattern)."""
    return SessionLocal()

log = logging.getLogger(__name__)


def _ctx_from_env() -> str | None:
    """For stdio transport: read API key from BUMBLEBEE_API_KEY env var."""
    return os.environ.get("BUMBLEBEE_API_KEY")


async def _resolve_auth(api_key: str) -> McpAuthContext:
    async with _db_session() as db:
        return await resolve_api_key(db, api_key)


def create_server(*, default_api_key: str | None = None) -> Server:
    """Build the MCP server with all Bumblebee tools registered.

    default_api_key: used by stdio transport. HTTP transport extracts per-request.
    """
    server = Server("bumblebee-mcp")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name=t.name,
                description=t.description,
                inputSchema=t.input_schema,
            )
            for t in TOOLS
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
        # Resolve auth from default key (stdio mode); HTTP mode injects via context
        api_key = default_api_key or _ctx_from_env()
        if not api_key:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "error": "BUMBLEBEE_API_KEY not set",
                    "hint": "Pass --api-key on `bb mcp serve` or export BUMBLEBEE_API_KEY",
                }),
            )]
        try:
            ctx = await _resolve_auth(api_key)
        except McpAuthError as e:
            return [TextContent(
                type="text",
                text=json.dumps({"error": "auth_failed", "message": str(e)}),
            )]

        try:
            async with _db_session() as db:
                result = await dispatch(db, ctx, name, arguments)
            return [TextContent(type="text", text=json.dumps(result, default=str))]
        except PermissionError as e:
            return [TextContent(
                type="text",
                text=json.dumps({"error": "permission_denied", "message": str(e)}),
            )]
        except ValueError as e:
            return [TextContent(
                type="text",
                text=json.dumps({"error": "invalid_params", "message": str(e)}),
            )]
        except Exception as e:
            log.exception("MCP tool %s failed", name)
            return [TextContent(
                type="text",
                text=json.dumps({"error": "internal", "message": str(e)[:300]}),
            )]

    return server


async def serve_stdio(api_key: str | None = None) -> None:
    """Run the MCP server on stdio (for Claude Desktop)."""
    from mcp.server.stdio import stdio_server

    server = create_server(default_api_key=api_key)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )
