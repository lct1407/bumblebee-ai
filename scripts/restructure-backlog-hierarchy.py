"""Restructure flat BB-1..15 backlog into proper Epic → Story → Task hierarchy.

Demonstrates: the system's own native types (EPIC/STORY/TASK/BUG/FEATURE/CHORE)
+ parent_id linkage. Uses raw SQLAlchemy here for speed; in production the
caller would invoke `bumblebee_issues(action="create", parent_number=N)` via MCP.
"""
from __future__ import annotations
import asyncio
import sys

from dotenv import load_dotenv
from sqlalchemy import func, select

load_dotenv()

from bumblebee.database import SessionLocal
from bumblebee.models.issue import Issue, IssueComplexity, IssuePriority, IssueStatus, IssueType
from bumblebee.models.project import Project


# Re-organization map: parent epic/story → list of existing BB-N to adopt
HIERARCHY = [
    # ───── EPIC: Wire end-to-end AI execution ─────
    {
        "kind": "epic",
        "title": "EPIC: Wire end-to-end AI execution",
        "description": "All sub-stories that unlock the core value-prop: AI actually runs code on user's device.",
        "priority": IssuePriority.CRITICAL,
        "stories": [
            {
                "title": "STORY: Agent harness uses real LLM provider",
                "priority": IssuePriority.CRITICAL,
                "adopts": [4],  # BB-4
            },
            {
                "title": "STORY: Daemon executes Claude CLI per role",
                "priority": IssuePriority.HIGH,
                "adopts": [6],  # BB-6
            },
            {
                "title": "STORY: Source-aware context (read scope_hints files)",
                "priority": IssuePriority.HIGH,
                "adopts": [5],  # BB-5
            },
            {
                "title": "STORY: Worker daemon foundation (G phase)",
                "priority": IssuePriority.HIGH,
                "adopts": [],  # device pairing already in earlier commit
            },
        ],
    },
    # ───── EPIC: Production launch readiness ─────
    {
        "kind": "epic",
        "title": "EPIC: Production launch readiness",
        "description": "Everything required before public commercial launch.",
        "priority": IssuePriority.HIGH,
        "stories": [
            {
                "title": "STORY: Security hardening",
                "priority": IssuePriority.CRITICAL,
                "adopts": [10, 7, 2],  # rotate secrets, permission audit, bcrypt
            },
            {
                "title": "STORY: Compliance + legal pages",
                "priority": IssuePriority.MEDIUM,
                "adopts": [8],  # ToS/Privacy/email
            },
            {
                "title": "STORY: Ops + observability baseline",
                "priority": IssuePriority.MEDIUM,
                "adopts": [9, 1],  # Sentry/metrics/backup, /health/db
            },
            {
                "title": "STORY: Test coverage for new modules",
                "priority": IssuePriority.MEDIUM,
                "adopts": [14],  # pytest
            },
        ],
    },
    # ───── EPIC: Frontend modernization ─────
    {
        "kind": "epic",
        "title": "EPIC: Frontend modernization",
        "description": "Web UI matches the backend capabilities — GraphQL throughout, key flows complete.",
        "priority": IssuePriority.MEDIUM,
        "stories": [
            {
                "title": "STORY: REST → GraphQL incremental migration",
                "priority": IssuePriority.MEDIUM,
                "adopts": [11],
            },
            {
                "title": "STORY: Issue lifecycle UI (Approve / Plan / Trigger / Cancel)",
                "priority": IssuePriority.HIGH,
                "adopts": [12],
            },
            {
                "title": "STORY: Project repo linking UI + validation",
                "priority": IssuePriority.MEDIUM,
                "adopts": [15],
            },
            {
                "title": "STORY: OAuth + auth flows",
                "priority": IssuePriority.HIGH,
                "adopts": [3],
            },
        ],
    },
    # ───── EPIC: Integrations ─────
    {
        "kind": "epic",
        "title": "EPIC: External system integrations",
        "description": "VCS, IDE plugins, notifications.",
        "priority": IssuePriority.MEDIUM,
        "stories": [
            {
                "title": "STORY: GitHub webhook full coverage",
                "priority": IssuePriority.MEDIUM,
                "adopts": [13],
            },
        ],
    },
]


async def main() -> int:
    async with SessionLocal() as db:
        proj = (
            await db.execute(select(Project).where(Project.slug == "bb"))
        ).scalar_one()

        async def next_num() -> int:
            return (
                await db.execute(
                    select(func.coalesce(func.max(Issue.number), 0) + 1).where(
                        Issue.project_id == proj.id
                    )
                )
            ).scalar_one()

        print(f"Project: {proj.name} ({proj.slug}) workspace={proj.workspace_id}\n")

        for epic_spec in HIERARCHY:
            # 1. Create or find Epic
            epic_title = epic_spec["title"]
            existing_epic = (
                await db.execute(
                    select(Issue).where(
                        Issue.project_id == proj.id, Issue.title == epic_title
                    )
                )
            ).scalar_one_or_none()
            if existing_epic:
                epic = existing_epic
                print(f"[skip-epic] BB-{epic.number}: {epic_title}")
            else:
                n = await next_num()
                epic = Issue(
                    project_id=proj.id, workspace_id=proj.workspace_id, number=n,
                    title=epic_title, description=epic_spec["description"],
                    type=IssueType.EPIC, priority=epic_spec["priority"],
                    status=IssueStatus.TRIAGED, ai_confidence=0.99,
                )
                db.add(epic)
                await db.flush()
                print(f"[ok]   BB-{n} EPIC: {epic_title}")

            # 2. Create or find Stories under Epic
            for story_spec in epic_spec["stories"]:
                story_title = story_spec["title"]
                existing_story = (
                    await db.execute(
                        select(Issue).where(
                            Issue.project_id == proj.id,
                            Issue.title == story_title,
                        )
                    )
                ).scalar_one_or_none()
                if existing_story:
                    story = existing_story
                    print(f"  [skip-story] BB-{story.number}: {story_title}")
                else:
                    n = await next_num()
                    story = Issue(
                        project_id=proj.id, workspace_id=proj.workspace_id, number=n,
                        title=story_title,
                        type=IssueType.STORY, priority=story_spec["priority"],
                        status=IssueStatus.TRIAGED, parent_id=epic.id,
                        ai_confidence=0.99,
                    )
                    db.add(story)
                    await db.flush()
                    print(f"  [ok]   BB-{n} STORY: {story_title}")

                # 3. Reassign existing tasks as children of story
                for task_num in story_spec["adopts"]:
                    task = (
                        await db.execute(
                            select(Issue).where(
                                Issue.project_id == proj.id, Issue.number == task_num
                            )
                        )
                    ).scalar_one_or_none()
                    if task and task.parent_id != story.id:
                        task.parent_id = story.id
                        print(f"    -> reparented BB-{task_num} under BB-{story.number}")

        await db.commit()

    print("\nhierarchy restructure complete.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
