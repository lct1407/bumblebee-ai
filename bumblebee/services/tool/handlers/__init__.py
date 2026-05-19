"""Tool handler registration. Each handler: async (args, session, db) -> ToolResult."""
from __future__ import annotations


def register_all(executor) -> None:
    """Register all built-in tool handlers."""
    from bumblebee.services.tool.handlers import issues, leases, scratch, knowledge, hitl, code

    issues.register(executor)
    leases.register(executor)
    scratch.register(executor)
    knowledge.register(executor)
    hitl.register(executor)
    code.register(executor)
