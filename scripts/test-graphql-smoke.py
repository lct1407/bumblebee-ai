"""Smoke test for GraphQL surface — runs schema queries directly without HTTP.

Verifies that all resolvers can build a context, hit the DB, and return shape-correct data.
"""
from __future__ import annotations
import asyncio
import sys

from dotenv import load_dotenv

load_dotenv()

from bumblebee.graphql.schema import schema
from bumblebee.graphql.context import GraphQLContext
from bumblebee.database import SessionLocal
from sqlalchemy import select
from bumblebee.models.workspace import Workspace


async def main() -> int:
    async with SessionLocal() as db:
        ws = (
            await db.execute(select(Workspace).order_by(Workspace.created_at.asc()).limit(1))
        ).scalar_one_or_none()
        if not ws:
            print("ERROR: seed first")
            return 1

        ctx = GraphQLContext(db=db, user=None, workspace=ws, role="owner")

        # 1. introspection (always works regardless of data)
        r = await schema.execute("{ __schema { queryType { name } } }", context_value=ctx)
        assert not r.errors, r.errors
        print(f"[ok] introspection: {r.data}")

        # 2. me
        r = await schema.execute("{ me { id name slug plan } }", context_value=ctx)
        assert not r.errors, r.errors
        print(f"[ok] me: {r.data}")

        # 3. projects
        r = await schema.execute("{ projects { id key slug name stagingBranch } }", context_value=ctx)
        assert not r.errors, r.errors
        print(f"[ok] projects: {len(r.data['projects'])} found, sample={r.data['projects'][:1]}")

        # 4. issues
        r = await schema.execute(
            "{ issues(limit: 3) { id number title status complexity } }",
            context_value=ctx,
        )
        assert not r.errors, r.errors
        print(f"[ok] issues: {len(r.data['issues'])} found, sample={r.data['issues'][:1]}")

        # 5. nodes
        r = await schema.execute("{ nodes { id name status capabilities } }", context_value=ctx)
        assert not r.errors, r.errors
        print(f"[ok] nodes: {len(r.data['nodes'])} found")

    print("\nGRAPHQL SMOKE: OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
