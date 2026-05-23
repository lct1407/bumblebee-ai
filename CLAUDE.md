# Bumblebee

Multi-agent SaaS task management platform. Workflows defined as LangGraph DAGs, agents are pluggable, all customer data scoped by workspace.

> **Single source of truth.** This folder (`D:/Source/bumblebee/` — repo `lct1407/bumblebee-ai`) contains backend + web + MCP server + tests + docs + plans. The old `Bumblebee-cli` repo is archived; merged into here on 2026-05-22.

## Read first

| If you're new | Start at |
|---|---|
| Anything | [docs/README.md](docs/README.md) — table of contents |
| Architecture concepts | [docs/architecture-overview.md](docs/architecture-overview.md) — 7-plane explanation + framework mapping (Agent / Context / Harness / Model) |
| User walkthrough | [docs/getting-started-guide.md](docs/getting-started-guide.md) (🇬🇧) · [docs/getting-started-guide-vi.md](docs/getting-started-guide-vi.md) (🇻🇳) |
| Setup for dev | [docs/getting-started.md](docs/getting-started.md) |
| DB tables | [docs/database-schema.md](docs/database-schema.md) |
| End-to-end flows | [docs/flow-walkthroughs.md](docs/flow-walkthroughs.md) |

## Folder layout

```
bumblebee/              ← Python package (FastAPI + LangGraph + services)
  main.py               ← app entry
  cli.py                ← bb Typer CLI
  routers/              ← REST endpoints (auth, issues, workspaces, billing, …)
  services/             ← Domain logic (control, dispatch, execution, state, safety, tool, rbac, billing)
  prompts/              ← 11 agent YAML prompts + Defense Baseline
  models/               ← SQLAlchemy 2.0 async models
  workflows/            ← LangGraph DAG YAMLs
  eval/                 ← Eval harness + golden dataset
bumblebee_mcp/          ← MCP server (stdio + Streamable HTTP)
  tools.py              ← 5 core tools
  gemini_tools.py       ← 2 Gemini-backed tools (smart_create + ask)
web/                    ← Next.js 16 frontend (App Router, Tailwind v4)
alembic/versions/       ← 5 migrations
tests/                  ← 153 pytest tests
scripts/                ← Operator scripts (backup, restore, release, stripe-setup, capture-*)
docs/                   ← All documentation (this is what you're reading)
plans/                  ← Plan files + reports
.claude/                ← Hooks + skills + session state
references/             ← Read-only reference projects (forge, nexus)
```

## Stack

- **Backend** — Python 3.12 · FastAPI · SQLAlchemy 2.0 async · Alembic · LangGraph
- **DB** — PostgreSQL 17 (workspace-scoped multi-tenancy via 13 scoped tables)
- **Frontend** — Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · React Query
- **Auth** — JWT (Bearer) + X-BB-API-Key + Google OAuth (Authlib)
- **LLM** — Vertex AI / Gemini (`google-genai` SDK) · Claude CLI (subprocess provider)
- **MCP** — Stdio for Claude Desktop · Streamable HTTP for Cursor / web clients
- **Billing** — Stripe Checkout + 5 idempotent webhook handlers + per-workspace quotas
- **Realtime** — WebSocket `/ws` with token+api_key auth gate

## Commands

| Package | Command |
|---|---|
| API dev | `uvicorn bumblebee.main:app --reload` |
| CLI | `pip install -e . && bb --help` |
| Web dev | `cd web && npm run dev` |
| Tests | `pytest` |
| MCP stdio | `python -m bumblebee_mcp.cli` |
| MCP HTTP | `python -m bumblebee_mcp.http_server` |
| Migrations | `alembic upgrade head` |
| Eval | `python -m bumblebee.eval.run` |

## Database

Local: `docker compose up -d` (Postgres 17 in `bumblebee-db` container).
Migrations: `alembic upgrade head`. Schema doc: [docs/database-schema.md](docs/database-schema.md).

## Key invariants (7-plane architecture)

| Plane | What | Where |
|---|---|---|
| Control | LangGraph orchestrator — workflow DAG execution | `bumblebee/services/control/` |
| Dispatch | Queue + SKIP LOCKED dequeue | `bumblebee/services/dispatch/` |
| Execution | Harness + LLM provider + context assembler | `bumblebee/services/execution/` |
| State | Append-only event log + IssueMemory projection | `bumblebee/services/state/` |
| Safety | Budget + loop + failure + mitigation | `bumblebee/services/safety/` |
| Tool | Skill registry + ToolExecutor + ToolResult | `bumblebee/services/tool/` |
| Observability | Audit events + WebSocket broadcast | `bumblebee/routers/audit.py`, `bumblebee/services/websocket/` |

Cross-cutting: RBAC (auto-scope via SQLAlchemy `before_insert` listeners) — `bumblebee/services/rbac/`.

## MCP tools

| Tool | Use |
|---|---|
| `bumblebee_workspaces` | list/get workspaces |
| `bumblebee_issues` | CRUD issues |
| `bumblebee_events` | append/list issue events |
| `bumblebee_workflows` | trigger workflows |
| `bumblebee_audit` | read audit log |
| `bumblebee_smart_create_issue` | Gemini drafts an issue from a prose description |
| `bumblebee_ask` | Gemini answers Q&A grounded in workspace context |

**Rule**: For CRUD on workspaces/issues/events — always use MCP tools, not `bb` CLI. Use `bb` only for agent workflow commands.

## Task lifecycle (mandatory when working on a Bumblebee issue)

1. **Fetch** via MCP `bumblebee_issues(action="get", id=…)` — never assume
2. **Read events** via `bumblebee_events(action="list", issue_id=…)`
3. **Branch** `git checkout -b feat/<short-desc>` — never commit to `master` directly
4. **Implement** following existing patterns in `bumblebee/services/`
5. **Test** `pytest tests/test_<area>.py`
6. **Append summary event** via MCP `bumblebee_events(action="append", …)`
7. **Update status** via MCP `bumblebee_issues(action="update", data='{"status":"…"}')`

Never push to `master` without explicit user approval. Never skip git hooks (`--no-verify`) unless asked.

## Documentation index

All docs live in `docs/`. Run `cat docs/README.md` for the table of contents.

Key references for prompt engineers: `bumblebee/prompts/*.yaml` (11 agent role prompts).
