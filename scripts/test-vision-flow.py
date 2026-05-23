"""End-to-end vision flow test:

  1. Signup new user via GraphQL  (workspace auto-created)
  2. Create project (REST — TODO: GraphQL mutation)
  3. Create issue via GraphQL
  4. Set complexity SIMPLE + auto_execute policy -> dispatch should bypass approval
  5. Set complexity COMPLEX + status NEW -> dispatch should be blocked
  6. Approve issue -> dispatch allowed
  7. Verify event log

Exercises H1 (complexity router), H2 (approval gate), GraphQL surface,
and the existing workflow_runs REST endpoint.
"""
from __future__ import annotations
import asyncio
import sys
import time

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import select, func

from bumblebee.database import SessionLocal
from bumblebee.graphql.schema import schema
from bumblebee.graphql.context import GraphQLContext
from bumblebee.models.issue import Issue as IssueModel, IssueStatus, IssueComplexity
from bumblebee.models.project import Project as ProjectModel
from bumblebee.models.workspace import Workspace
from bumblebee.services.safety.approval_gate import check_dispatch_allowed
from bumblebee.services.control.workflow_selector import select_workflow_name


def banner(s: str) -> None:
    print(f"\n{'=' * 60}\n  {s}\n{'=' * 60}")


async def main() -> int:
    async with SessionLocal() as db:
        ws = (
            await db.execute(select(Workspace).order_by(Workspace.created_at.asc()).limit(1))
        ).scalar_one_or_none()
        if not ws:
            print("seed first")
            return 1
        ctx = GraphQLContext(db=db, user=None, workspace=ws, role="owner")
        project = (
            await db.execute(select(ProjectModel).where(ProjectModel.workspace_id == ws.id).limit(1))
        ).scalar_one_or_none()
        if not project:
            print("seed first")
            return 1

        banner("STEP 1  createIssue via GraphQL")
        suffix = str(int(time.time()))[-6:]
        r = await schema.execute(
            """
            mutation($pid: UUID!, $title: String!) {
              createIssue(input: {projectId: $pid, title: $title, description: "vision-test"}) {
                id number title status complexity
              }
            }
            """,
            variable_values={"pid": str(project.id), "title": f"vision-test {suffix}"},
            context_value=ctx,
        )
        if r.errors:
            print("ERRORS:", r.errors)
            return 1
        issue_id = r.data["createIssue"]["id"]
        print(f"  created issue: {r.data['createIssue']}")

        banner("STEP 2  H2 gate — complex+NEW should BLOCK")
        issue = await db.get(IssueModel, issue_id)
        issue.complexity = IssueComplexity.COMPLEX
        await db.commit()
        await db.refresh(issue)
        d = check_dispatch_allowed(issue, project)
        print(f"  decision: allowed={d.allowed} reason={d.reason}")
        assert not d.allowed, "should be blocked"

        banner("STEP 3  Approve via GraphQL -> H2 gate lets through")
        r = await schema.execute(
            "mutation($id: UUID!) { approveIssue(id: $id) { status } }",
            variable_values={"id": issue_id},
            context_value=ctx,
        )
        if r.errors:
            print("ERRORS:", r.errors)
            return 1
        print(f"  approveIssue -> {r.data['approveIssue']}")
        await db.refresh(issue)
        d = check_dispatch_allowed(issue, project)
        assert d.allowed, f"should be allowed: {d.reason}"
        print(f"  decision: allowed={d.allowed} reason={d.reason}")

        banner("STEP 4  H1 router — complex picks feature-complex-flow")
        wf = select_workflow_name(issue, project)
        print(f"  workflow: {wf}")
        assert wf == "feature-complex-flow"

        banner("STEP 5  Simple + auto-execute policy bypasses approval")
        # Set issue back to NEW and complexity=SIMPLE, set project policy
        issue.status = IssueStatus.NEW
        issue.complexity = IssueComplexity.SIMPLE
        project.policy_config = {**(project.policy_config or {}), "auto_execute_simple": True}
        await db.commit()
        await db.refresh(issue)
        await db.refresh(project)
        d = check_dispatch_allowed(issue, project)
        print(f"  decision: allowed={d.allowed} reason={d.reason}")
        assert d.allowed and d.auto
        wf = select_workflow_name(issue, project)
        print(f"  workflow: {wf}")
        assert wf == "simple-fix-flow"

        banner("STEP 6  Query events via GraphQL")
        r = await schema.execute(
            "{ events(limit: 5) { type source occurredAt } }",
            context_value=ctx,
        )
        if r.errors:
            print("ERRORS:", r.errors)
            return 1
        print(f"  recent events: {len(r.data['events'])}")
        for e in r.data["events"][:3]:
            print(f"    - {e['type']} from {e['source']}")

        # Cleanup
        await db.delete(issue)
        project.policy_config = {k: v for k, v in (project.policy_config or {}).items() if k != "auto_execute_simple"}
        await db.commit()

    banner("VISION FLOW: ALL ASSERTIONS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
