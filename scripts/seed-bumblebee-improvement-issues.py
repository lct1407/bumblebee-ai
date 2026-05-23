"""Seed improvement issues for the Bumblebee project itself (dogfooding).

These are the gaps identified in the 2026-05-23 commercial-readiness audit.
Each issue carries pre-set complexity + scope_hints so the Triager + workflow
selector can route them straight to the right flow.

Run:
  PYTHONPATH=. python scripts/seed-bumblebee-improvement-issues.py
"""
from __future__ import annotations
import asyncio
import sys

from dotenv import load_dotenv
from sqlalchemy import func, select

load_dotenv()

from bumblebee.database import SessionLocal
from bumblebee.models.issue import (
    Issue, IssueComplexity, IssuePriority, IssueStatus, IssueType,
)
from bumblebee.models.project import Project


ISSUES = [
    {
        "title": "fix: Wire real LLM provider in agent harness (replace stub)",
        "type": IssueType.BUG,
        "priority": IssuePriority.CRITICAL,
        "complexity": IssueComplexity.COMPLEX,
        "description": (
            "bumblebee/services/control/orchestrator.py:60 uses provider='stub'. "
            "Replace with real Claude CLI subprocess invocation per role. "
            "Acceptance: Implementer agent actually calls Claude CLI and returns "
            "generated diff/code, not stub_ok. Core value-prop blocker."
        ),
        "scope_hints": [
            "bumblebee/services/control/orchestrator.py",
            "bumblebee/services/execution/harness.py",
            "bumblebee/services/execution/llm_provider.py",
        ],
        "ai_acceptance_criteria": {
            "criteria": [
                "Implementer role makes real LLM call (not stub)",
                "Token usage + cost recorded on AgentSession",
                "Cancellation via stop button works",
                "Existing tests still pass",
            ]
        },
    },
    {
        "title": "feat: Source-aware context builder reads file contents matching scope_hints",
        "type": IssueType.FEATURE,
        "priority": IssuePriority.HIGH,
        "complexity": IssueComplexity.COMPLEX,
        "description": (
            "context_assembler.py:160 only filters Knowledge DB entries. Need to "
            "actually open files matching scope_hints globs, include their content "
            "in user message (truncate to 200KB total). Critical for AI to "
            "understand the repo."
        ),
        "scope_hints": ["bumblebee/services/execution/context_assembler.py"],
        "ai_acceptance_criteria": {
            "criteria": [
                "Reads up to N kB of source matching scope_hints",
                "Truncates oldest/largest files when over budget",
                "Skips binary files + node_modules + .venv",
                "Streams via context budget per role",
            ]
        },
    },
    {
        "title": "feat: bb daemon invokes Claude CLI per role instead of shell command",
        "type": IssueType.FEATURE,
        "priority": IssuePriority.HIGH,
        "complexity": IssueComplexity.MEDIUM,
        "description": (
            "Worker daemon currently exec shell command from payload. "
            "Add per-role exec mode: pull role prompt + scope context + run "
            "`claude --print` to get diff, apply via `git apply`."
        ),
        "scope_hints": ["bumblebee/worker/daemon.py"],
    },
    {
        "title": "fix: Audit GraphQL resolvers for require_permission enforcement",
        "type": IssueType.BUG,
        "priority": IssuePriority.HIGH,
        "complexity": IssueComplexity.MEDIUM,
        "description": (
            "Most GraphQL resolvers only call _require_workspace, not permission "
            "level (e.g. MANAGE_BILLING for createCheckoutSession). Add "
            "require_permission decorator or directive."
        ),
        "scope_hints": [
            "bumblebee/graphql/mutations.py",
            "bumblebee/graphql/queries.py",
        ],
    },
    {
        "title": "feat: Legal pages (ToS + Privacy) + transactional emails",
        "type": IssueType.FEATURE,
        "priority": IssuePriority.MEDIUM,
        "complexity": IssueComplexity.MEDIUM,
        "description": (
            "Need web/src/app/(public)/legal/{tos,privacy}/page.tsx + email service "
            "(Resend or Postmark) for signup-verify, password-reset, invoice-receipt. "
            "Required for SaaS launch."
        ),
        "scope_hints": [
            "web/src/app/(public)/legal/",
            "bumblebee/services/email/",
        ],
    },
    {
        "title": "ops: Sentry + Prometheus metrics + nightly DB backup cron",
        "type": IssueType.CHORE,
        "priority": IssuePriority.MEDIUM,
        "complexity": IssueComplexity.MEDIUM,
        "description": (
            "Add SENTRY_DSN env, instrument FastAPI + Next.js. /metrics endpoint "
            "with Prometheus exposition. Schedule pg_dump nightly to "
            "S3-compatible bucket via scripts/backup.sh + cron."
        ),
        "scope_hints": ["scripts/backup.sh", "bumblebee/main.py"],
    },
    {
        "title": "fix: Rotate placeholder secrets before prod",
        "type": IssueType.BUG,
        "priority": IssuePriority.CRITICAL,
        "complexity": IssueComplexity.SIMPLE,
        "description": (
            "API_SECRET_KEY=change-me-in-production, STRIPE_WEBHOOK_SECRET empty. "
            "Generate via openssl rand and rotate. Document in disaster-recovery.md."
        ),
        "scope_hints": [".env.example", "docs/disaster-recovery.md"],
    },
    {
        "title": "feat: Migrate web pages from REST to GraphQL hooks (incremental)",
        "type": IssueType.FEATURE,
        "priority": IssuePriority.MEDIUM,
        "complexity": IssueComplexity.COMPLEX,
        "description": (
            "Foundation done in web/src/lib/graphql-{client,hooks}.ts. "
            "Replace axios + react-query REST calls in each page with useMe / "
            "useIssues / useProjects / useNodes hooks. Per-page incremental work."
        ),
        "scope_hints": [
            "web/src/app/(app)/dashboard/",
            "web/src/app/(app)/issues/",
            "web/src/app/(app)/settings/",
            "web/src/components/app/",
        ],
    },
    {
        "title": "feat: Web UI for issue Approve + Trigger Workflow buttons",
        "type": IssueType.FEATURE,
        "priority": IssuePriority.HIGH,
        "complexity": IssueComplexity.MEDIUM,
        "description": (
            "Issue detail page needs: Approve button (calls approveIssue mutation), "
            "Trigger Workflow button (POST /api/workflow-runs/trigger), Activity "
            "timeline tab (WebSocket /ws subscribe to issue events)."
        ),
        "scope_hints": ["web/src/app/(app)/issues/[id]/"],
    },
    {
        "title": "feat: GitHub webhook push event auto-creates issue",
        "type": IssueType.FEATURE,
        "priority": IssuePriority.LOW,
        "complexity": IssueComplexity.MEDIUM,
        "description": (
            "Currently webhooks_github.py handles PR + Issue events. Extend to "
            "push events: commits matching 'fix #N' or 'TODO:' regex auto-create "
            "bumblebee issues."
        ),
        "scope_hints": ["bumblebee/routers/webhooks_github.py"],
    },
    {
        "title": "test: Add pytest coverage for new modules (daemon, installer, graphql)",
        "type": IssueType.CHORE,
        "priority": IssuePriority.MEDIUM,
        "complexity": IssueComplexity.MEDIUM,
        "description": (
            "Zero tests for: worker/daemon.py, installer/bundler.py, graphql/*, "
            "services/safety/approval_gate.py, services/control/staging_flow.py. "
            "Target 70% coverage."
        ),
        "scope_hints": ["tests/"],
    },
    {
        "title": "feat: Project repo linking UI with git URL validation",
        "type": IssueType.FEATURE,
        "priority": IssuePriority.MEDIUM,
        "complexity": IssueComplexity.MEDIUM,
        "description": (
            "Project Settings page needs UI to set repo_path + base_branch + "
            "staging_branch + auto_execute_simple toggle. Validate git URL reachable "
            "(curl HEAD or git ls-remote)."
        ),
        "scope_hints": ["web/src/app/(app)/settings/", "bumblebee/graphql/mutations.py"],
    },
]


async def main() -> int:
    async with SessionLocal() as db:
        proj = (
            await db.execute(select(Project).where(Project.slug == "bb"))
        ).scalar_one_or_none()
        if not proj:
            print("ERROR: project 'bb' not found — run seed_default first")
            return 1

        # Skip already-seeded titles
        existing = {
            i.title
            for i in (
                await db.execute(select(Issue).where(Issue.project_id == proj.id))
            ).scalars().all()
        }

        created = 0
        for spec in ISSUES:
            if spec["title"] in existing:
                print(f"  [skip] {spec['title'][:60]}…")
                continue
            n = (
                await db.execute(
                    select(func.coalesce(func.max(Issue.number), 0) + 1).where(
                        Issue.project_id == proj.id
                    )
                )
            ).scalar_one()
            i = Issue(
                project_id=proj.id,
                workspace_id=proj.workspace_id,
                number=n,
                title=spec["title"],
                description=spec["description"],
                type=spec["type"],
                priority=spec["priority"],
                complexity=spec.get("complexity"),
                status=IssueStatus.TRIAGED,  # pre-classified
                scope_hints=spec.get("scope_hints", []),
                ai_acceptance_criteria=spec.get("ai_acceptance_criteria"),
                ai_summary=spec["description"][:200],
                ai_confidence=0.95,  # human-seeded, high confidence
            )
            db.add(i)
            await db.flush()
            print(f"  [ok]   BB-{n}: {spec['title'][:60]}")
            created += 1
        await db.commit()
        print(f"\nseeded {created} new issues into project bb ({proj.id})")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
