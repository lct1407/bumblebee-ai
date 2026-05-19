"""Seed default project, agent definitions, skills, workflows, and sample issues.

Run: python -m src.seeds.seed_default
"""
import asyncio
import hashlib
import json
from pathlib import Path
import yaml
from sqlalchemy import select

from bumblebee.database import SessionLocal
from bumblebee.models.project import Project
from bumblebee.models.agent_definition import AgentDefinition
from bumblebee.models.skill import Skill
from bumblebee.models.workflow import Workflow
from bumblebee.models.issue import Issue, IssueType, IssueStatus, IssuePriority
from bumblebee.models.knowledge_entry import KnowledgeEntry, KnowledgeCategory


WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"


AGENT_DEFINITIONS = [
    {
        "name": "Default Triager",
        "role": "triager",
        "description": "Classifies issues by complexity, enriches description, sets priority.",
        "prompt_template": (
            "You are a Triager agent. Given an issue title and description, classify its complexity "
            "(simple/medium/complex), set priority, suggest acceptance criteria, and identify scope hints. "
            "Output structured JSON: {complexity, priority, ai_summary, ai_acceptance_criteria, ai_confidence}."
        ),
        "default_tools": ["get_issue", "update_issue_status", "add_knowledge", "query_knowledge"],
        "focus_areas": ["classification", "scope", "enrichment"],
        "default_budgets": {"wall_min": 10, "tokens_max": 30000, "dollars_max": 0.5},
    },
    {
        "name": "Default Coordinator",
        "role": "coordinator",
        "description": "Supervises Complex issues: decomposes into specialist sub-tasks, integrates results.",
        "prompt_template": (
            "You are the Coordinator. Given a triaged issue, decompose it into disjoint specialist "
            "sub-tasks (each with file scope glob). Dispatch in parallel, then integrate results. "
            "Output: {plan_summary, sub_tasks: [{role, scope}]}."
        ),
        "default_tools": [
            "list_issues", "get_issue", "create_issue", "add_knowledge",
            "query_knowledge", "request_human_approval", "scratch_write", "scratch_read",
        ],
        "focus_areas": ["decomposition", "supervision", "integration"],
        "default_budgets": {"wall_min": 30, "tokens_max": 80000, "dollars_max": 2.0},
    },
    {
        "name": "Default Implementer",
        "role": "implementer",
        "description": "Implements code changes in a worktree branch.",
        "prompt_template": (
            "You are an Implementer. Implement the requested change in the worktree on your branch. "
            "Hold a scope lease on the file globs you'll modify. Commit when done."
        ),
        "default_tools": [
            "acquire_scope_lease", "release_scope_lease", "read_file", "write_file",
            "search_code", "run_lint", "git_commit", "git_diff",
            "scratch_write", "scratch_read", "add_knowledge",
        ],
        "focus_areas": ["code-quality", "convention-adherence"],
        "default_budgets": {"wall_min": 60, "tokens_max": 160000, "dollars_max": 3.0},
    },
    {
        "name": "Default Tester",
        "role": "tester",
        "description": "Runs tests, validates implementation against acceptance criteria.",
        "prompt_template": (
            "You are a Tester. Run the test suite. Report which tests pass/fail and verdict."
        ),
        "default_tools": ["acquire_scope_lease", "run_tests", "read_file", "search_code", "add_comment"],
        "focus_areas": ["coverage", "regression"],
        "default_budgets": {"wall_min": 30, "tokens_max": 60000, "dollars_max": 1.0},
    },
    {
        "name": "Default Reviewer",
        "role": "reviewer",
        "description": "Independent code review for Complex issues. Approves or requests changes.",
        "prompt_template": (
            "You are a Reviewer. Review the diff independently. Approve or request changes with rationale."
        ),
        "default_tools": ["git_diff", "read_file", "search_code", "add_comment", "request_human_approval"],
        "focus_areas": ["security", "performance", "design"],
        "default_budgets": {"wall_min": 20, "tokens_max": 80000, "dollars_max": 1.5},
    },
    {
        "name": "Default Assistant",
        "role": "assistant",
        "description": "ChatSession Tier 2: Q&A + suggest issues/knowledge with HITL.",
        "prompt_template": (
            "You are the Assistant. Answer questions about the project. "
            "For creating issues or knowledge entries, ALWAYS use 'suggest_*' tools (user must approve)."
        ),
        "default_tools": [
            "list_issues", "get_issue", "search_code", "query_knowledge",
            "suggest_issue", "suggest_knowledge_entry",
        ],
        "focus_areas": ["clarity", "user-friendliness"],
        "default_budgets": {"wall_min": 10, "tokens_max": 50000, "dollars_max": 0.5},
    },
    {
        "name": "Default Integrator",
        "role": "integrator",
        "description": "Merges specialist branches at end of Complex flow.",
        "prompt_template": (
            "You are the Integrator. Merge specialist branches; resolve trivial conflicts; "
            "escalate to coordinator if non-trivial."
        ),
        "default_tools": ["acquire_scope_lease", "git_diff", "git_commit", "request_human_approval"],
        "focus_areas": ["merge", "conflict-resolution"],
        "default_budgets": {"wall_min": 15, "tokens_max": 40000, "dollars_max": 0.8},
    },
]


SAMPLE_KNOWLEDGE = [
    {
        "title": "Auth uses bcrypt for password hashing",
        "body": "Bumblebee API hashes passwords with bcrypt via passlib. Cost factor 12. "
                "Do not switch to argon2 without security review.",
        "category": KnowledgeCategory.DECISION,
        "tags": ["auth", "security"],
        "scope_globs": ["api/src/auth/**"],
    },
    {
        "title": "All API endpoints return JSON",
        "body": "Even error responses return JSON: {detail: '...', code?: '...'}. "
                "Never return plain text from REST endpoints.",
        "category": KnowledgeCategory.CONVENTION,
        "tags": ["api", "response"],
        "scope_globs": ["api/src/routers/**"],
    },
    {
        "title": "Event log is append-only",
        "body": "Never UPDATE rows in 'events' table. Materialized views project from events. "
                "Inconsistency = view bug, fix by reprojection.",
        "category": KnowledgeCategory.CONVENTION,
        "tags": ["event-sourcing", "state-plane"],
        "scope_globs": ["api/src/services/state/**", "api/src/models/event.py"],
    },
    {
        "title": "Workspaces are isolated git worktrees, never shared",
        "body": "Each AgentSession gets its own worktree branch. Never share workspaces across sessions.",
        "category": KnowledgeCategory.PITFALL,
        "tags": ["workspace", "git"],
        "scope_globs": ["api/src/services/execution/**"],
    },
    {
        "title": "Python module naming uses snake_case",
        "body": "Files: snake_case.py. Classes: PascalCase. Functions/variables: snake_case. "
                "Constants: UPPER_SNAKE.",
        "category": KnowledgeCategory.CONVENTION,
        "tags": ["style", "python"],
        "scope_globs": ["api/**/*.py"],
    },
]


SAMPLE_ISSUES = [
    {
        "title": "Add /health/db endpoint",
        "description": "Add a DB liveness check endpoint that returns ok if SELECT 1 succeeds.",
        "type": IssueType.TASK,
        "priority": IssuePriority.MEDIUM,
        "scope_hints": ["api/src/routers/health.py"],
        "acceptance_criteria": "GET /health/db returns 200 with {db: 'ok'} when DB reachable.",
    },
    {
        "title": "Fix bcrypt cost factor too low",
        "description": "Currently using cost=4 in dev; production should be 12.",
        "type": IssueType.BUG,
        "priority": IssuePriority.HIGH,
        "scope_hints": ["api/src/auth/**"],
        "acceptance_criteria": "bcrypt rounds >= 12 in production; tests pass.",
    },
    {
        "title": "Implement OAuth2 login (Google)",
        "description": (
            "Add Google OAuth2 sign-in. Backend issues JWT. Frontend stores in httpOnly cookie. "
            "Refresh tokens supported."
        ),
        "type": IssueType.FEATURE,
        "priority": IssuePriority.HIGH,
        "scope_hints": ["api/src/auth/**", "web/src/app/login/**"],
        "acceptance_criteria": (
            "User can click 'Sign in with Google' â†’ redirected to Google â†’ returns with JWT cookie set. "
            "Refresh token mechanism works."
        ),
    },
]


def hash_prompt(template: str) -> str:
    return hashlib.sha256(template.encode()).hexdigest()


def hash_graph(graph: dict) -> str:
    return hashlib.sha256(json.dumps(graph, sort_keys=True).encode()).hexdigest()


async def seed() -> None:
    async with SessionLocal() as db:
        # 1. Default project
        existing = (
            await db.execute(select(Project).where(Project.slug == "bb"))
        ).scalar_one_or_none()
        if existing:
            print("[skip] project 'bb' already exists")
            project = existing
        else:
            project = Project(
                name="Bumblebee",
                slug="bb",
                key="BB",
                description="Default Bumblebee project (seeded)",
                base_branch="main",
                policy_config={
                    "session_wall_min": 60,
                    "session_tokens_max": 160_000,
                    "session_dollars_max": 3.0,
                    "issue_dollars_max": 10.0,
                    "project_daily_dollars_max": 200.0,
                },
            )
            db.add(project)
            await db.flush()
            print(f"[ok] created project bb ({project.id})")

        # 2. Agent definitions
        for spec in AGENT_DEFINITIONS:
            exists = (
                await db.execute(
                    select(AgentDefinition).where(
                        AgentDefinition.role == spec["role"], AgentDefinition.is_global == True
                    )
                )
            ).scalar_one_or_none()
            if exists:
                print(f"[skip] agent definition role={spec['role']} exists")
                continue
            ad = AgentDefinition(
                name=spec["name"],
                role=spec["role"],
                description=spec["description"],
                prompt_template=spec["prompt_template"],
                prompt_hash=hash_prompt(spec["prompt_template"]),
                default_tools=spec["default_tools"],
                focus_areas=spec["focus_areas"],
                default_budgets=spec["default_budgets"],
                is_global=True,
            )
            db.add(ad)
            print(f"[ok] agent definition: {spec['role']}")

        # 3. Workflows (load from YAML files)
        for wf_file in WORKFLOWS_DIR.glob("*.yaml"):
            text = wf_file.read_text(encoding="utf-8")
            data = yaml.safe_load(text)
            name = data["name"]
            exists = (
                await db.execute(select(Workflow).where(Workflow.name == name))
            ).scalar_one_or_none()
            if exists:
                print(f"[skip] workflow {name} exists")
                continue
            wf = Workflow(
                name=name,
                version=data.get("version", 1),
                graph=data,
                graph_hash=hash_graph(data),
                description=data.get("description"),
                is_active=True,
                is_default=(name == "simple-fix-flow"),
            )
            db.add(wf)
            print(f"[ok] workflow: {name}")

        # 4. Knowledge entries
        for k in SAMPLE_KNOWLEDGE:
            exists = (
                await db.execute(
                    select(KnowledgeEntry).where(
                        KnowledgeEntry.title == k["title"],
                        KnowledgeEntry.project_id == project.id,
                    )
                )
            ).scalar_one_or_none()
            if exists:
                continue
            ke = KnowledgeEntry(
                title=k["title"],
                body=k["body"],
                category=k["category"],
                tags=k["tags"],
                scope_globs=k["scope_globs"],
                project_id=project.id,
            )
            db.add(ke)
            print(f"[ok] knowledge: {k['title'][:50]}")

        # 5. Sample issues (BB-1, BB-2, BB-3)
        from sqlalchemy import func
        max_num_q = (
            await db.execute(
                select(func.coalesce(func.max(Issue.number), 0)).where(Issue.project_id == project.id)
            )
        )
        max_num = max_num_q.scalar() or 0
        for i, spec in enumerate(SAMPLE_ISSUES, start=max_num + 1):
            iss = Issue(
                number=i,
                title=spec["title"],
                description=spec["description"],
                type=spec["type"],
                priority=spec["priority"],
                scope_hints=spec["scope_hints"],
                acceptance_criteria=spec["acceptance_criteria"],
                status=IssueStatus.NEW,
                project_id=project.id,
            )
            db.add(iss)
            print(f"[ok] issue BB-{i}: {spec['title']}")

        await db.commit()
        print("\n[done] seed complete")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
