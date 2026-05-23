"""GraphQL surface — primary API as of 2026-05-23.

REST routers are being retired in favor of this. Webhooks (Stripe, GitHub) and
MCP RPC remain on their own surfaces per protocol requirements.
"""
from bumblebee.graphql.schema import schema, graphql_router

__all__ = ["schema", "graphql_router"]
