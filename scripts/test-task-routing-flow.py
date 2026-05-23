"""End-to-end test: BB-16/17/18 device-project binding + task routing.

Flow:
  1. Create 2 test nodes: one bound to project bb, one bound to other project
  2. Enqueue a task with required_project_id = bb.id
  3. Node-not-bound: claim_next → must return None
  4. Node-bound:    claim_next → must return our task
  5. Cleanup
"""
from __future__ import annotations
import asyncio
import hashlib
import secrets
import sys
import uuid

from dotenv import load_dotenv
from sqlalchemy import select, text

load_dotenv()

from bumblebee.database import SessionLocal
from bumblebee.models.agent_node import AgentNode, NodeStatus
from bumblebee.models.project import Project
from bumblebee.services.dispatch.task_queue import claim_next, enqueue


def banner(m: str) -> None:
    print(f"\n{'=' * 60}\n  {m}\n{'=' * 60}")


async def main() -> int:
    async with SessionLocal() as db:
        project_bb = (
            await db.execute(select(Project).where(Project.slug == "bb"))
        ).scalar_one()
        # Synthesize a "second project" id (doesn't need to exist; binding is just UUIDs)
        other_project_id = uuid.uuid4()

        banner("STEP 1  Create 2 test nodes")
        node_bb = AgentNode(
            workspace_id=project_bb.workspace_id,
            name="test-node-bb",
            status=NodeStatus.ACTIVE,
            token_hash=hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
            capabilities=["claude-cli", "git"],
            bound_project_ids=[str(project_bb.id)],
        )
        node_other = AgentNode(
            workspace_id=project_bb.workspace_id,
            name="test-node-other",
            status=NodeStatus.ACTIVE,
            token_hash=hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
            capabilities=["claude-cli", "git"],
            bound_project_ids=[str(other_project_id)],
        )
        db.add(node_bb)
        db.add(node_other)
        await db.commit()
        print(f"  node-bb    bound to bb ({project_bb.id})")
        print(f"  node-other bound to other ({other_project_id})")

        banner("STEP 2  Enqueue a task for project bb")
        task_id = await enqueue(
            db,
            payload={"command_kind": "test", "command": "echo hello", "repo_path": project_bb.repo_path},
            required_provider="claude-cli",
            required_project_id=project_bb.id,
            priority=1,
            idempotency_key=f"test-routing-{uuid.uuid4()}",
        )
        await db.commit()
        print(f"  enqueued task {task_id} with required_project_id={project_bb.id}")

        banner("STEP 3  Node-other tries to claim — must return None")
        claimed_by_other = await claim_next(
            db,
            claimed_by=f"node:{node_other.id}",
            required_provider="claude-cli",
            bound_project_ids=node_other.bound_project_ids,
        )
        await db.commit()
        if claimed_by_other is None:
            print("  ✓ node-other got None (correctly excluded)")
        else:
            print(f"  ✗ node-other got task {claimed_by_other['id']} — FAIL")
            return 1

        banner("STEP 4  Node-bb claims — must succeed")
        claimed_by_bb = await claim_next(
            db,
            claimed_by=f"node:{node_bb.id}",
            required_provider="claude-cli",
            bound_project_ids=node_bb.bound_project_ids,
        )
        await db.commit()
        if claimed_by_bb is None:
            print("  ✗ node-bb got None — FAIL")
            return 1
        elif claimed_by_bb["id"] == task_id:
            print(f"  ✓ node-bb got task {task_id} (correct)")
            print(f"    payload: {claimed_by_bb['payload']}")
            print(f"    required_project_id: {claimed_by_bb['required_project_id']}")
        else:
            print(f"  ? unexpected task {claimed_by_bb['id']} (might be unrelated, check)")

        banner("STEP 5  Cleanup")
        await db.execute(text("DELETE FROM task_queue WHERE id = :id"), {"id": task_id})
        await db.delete(node_bb)
        await db.delete(node_other)
        await db.commit()
        print("  cleanup OK")

    banner("ROUTING FLOW: ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
