"""Strawberry schema + FastAPI router mount."""
from __future__ import annotations

import strawberry
from strawberry.fastapi import GraphQLRouter

from bumblebee.graphql.context import get_context
from bumblebee.graphql.mutations import Mutation
from bumblebee.graphql.queries import Query

schema = strawberry.Schema(query=Query, mutation=Mutation)

graphql_router = GraphQLRouter(
    schema,
    context_getter=get_context,
    path="/graphql",
)
