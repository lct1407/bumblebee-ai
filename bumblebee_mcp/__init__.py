"""Bumblebee MCP server — exposes core tools to external agents (Claude Code, Desktop, Cursor).

Phase B of the commercial SaaS plan. Tools are workspace-scoped via Bumblebee API key.

Tools exposed:
- list_issues       — paginated issue list with filters
- get_issue         — single issue by number
- create_issue      — file a new issue
- trigger_workflow  — start a workflow run on an issue
- get_events        — recent events for an issue or workspace

Two transports: stdio (Claude Desktop local) + Streamable HTTP (Claude Code / Cursor).
"""
__version__ = "0.1.0"
