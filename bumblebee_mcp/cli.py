"""bb mcp serve — CLI entry point for the MCP server.

Two transports:
  bb mcp serve --transport stdio              # for Claude Desktop config
  bb mcp serve --transport http --port 8080   # for Claude Code / Cursor / API

API key resolution order:
  1. --api-key CLI flag
  2. BUMBLEBEE_API_KEY env var
  3. (HTTP only) `Authorization: Bearer <key>` header per request
"""
from __future__ import annotations
import asyncio
import os
import sys

import typer

app = typer.Typer(help="Bumblebee MCP server")


@app.command("serve")
def serve(
    transport: str = typer.Option(
        "stdio",
        "--transport",
        "-t",
        help="stdio (Claude Desktop) or http (Streamable HTTP for Claude Code/Cursor)",
    ),
    port: int = typer.Option(8080, "--port", "-p", help="HTTP transport port"),
    host: str = typer.Option("127.0.0.1", "--host", help="HTTP transport bind host"),
    api_key: str = typer.Option(
        None,
        "--api-key",
        envvar="BUMBLEBEE_API_KEY",
        help="API key (stdio uses this; HTTP reads per-request Authorization)",
    ),
):
    """Start the Bumblebee MCP server."""
    if transport == "stdio":
        if not api_key:
            typer.echo("ERROR: --api-key or BUMBLEBEE_API_KEY required for stdio", err=True)
            raise typer.Exit(1)
        from bumblebee_mcp.server import serve_stdio
        try:
            asyncio.run(serve_stdio(api_key))
        except KeyboardInterrupt:
            pass
    elif transport == "http":
        try:
            from bumblebee_mcp.http_server import serve_http
        except ImportError as e:
            typer.echo(f"HTTP transport unavailable: {e}", err=True)
            raise typer.Exit(1)
        asyncio.run(serve_http(host=host, port=port))
    else:
        typer.echo(f"Unknown transport: {transport}. Use stdio or http.", err=True)
        raise typer.Exit(1)


@app.command("list-tools")
def list_tools_cmd():
    """Print the catalog of registered MCP tools (for docs/debugging)."""
    from bumblebee_mcp.tools import TOOLS

    for t in TOOLS:
        typer.echo(f"\n• {t.name}")
        typer.echo(f"    {t.description}")
        typer.echo(f"    requires: {t.required_permission.value}")


if __name__ == "__main__":
    app()
