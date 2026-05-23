# Source layout

Everything lives in **one folder**: `D:/Source/bumblebee/` (GitHub: `lct1407/bumblebee-ai`).

> **History**: Before 2026-05-22, the code was in `D:/Source/bumblebee-v3/` and the docs/plans were in a separate repo `D:/Source/Bumblebee-cli/`. We merged them. A small Go experiment at `D:/Source/bumblebee/` (repo `lct1407/bumblebee`, abandoned May 2026) was renamed to `D:/Source/bumblebee-legacy-go/`.

---

## Tree

```
bumblebee/                          ← THE repo (lct1407/bumblebee-ai)
│
├── bumblebee/                      ← Python package (pip install -e .)
│   ├── main.py                     ← FastAPI app entry point
│   ├── cli.py                      ← `bb` CLI (Typer)
│   ├── config.py                   ← env-driven settings (pydantic-settings)
│   ├── database.py                 ← async SQLAlchemy engine
│   ├── models/                     ← 19 SQLAlchemy models
│   ├── routers/                    ← REST endpoints
│   │   ├── auth.py                 ← /api/auth/* (register, login, me, api-keys)
│   │   ├── oauth_google.py         ← /api/auth/google/* (OAuth flow)
│   │   ├── workspaces.py           ← /api/workspaces/* + members + invites
│   │   ├── issues.py               ← /api/issues/* (CRUD + field-level audit)
│   │   ├── billing.py              ← /api/billing/* (checkout, invoices, cancel)
│   │   ├── stripe_webhooks.py      ← /api/stripe/webhook (5 idempotent handlers)
│   │   ├── audit.py                ← /api/audit/events.{json,csv}
│   │   ├── changelog.py            ← /api/changelog (parsed CHANGELOG.md)
│   │   ├── websocket.py            ← /ws (live event stream + token+api_key auth gate)
│   │   └── events.py / workflow_runs.py / chat.py / notifications.py / plugins.py / replay.py
│   ├── prompts/                    ← 11 agent YAML prompts + Defense Baseline + loader + validator
│   ├── services/                   ← Domain logic (no HTTP/SQL leak)
│   │   ├── control/                ← LangGraph orchestrator
│   │   ├── dispatch/               ← Queue + SKIP LOCKED dequeue
│   │   ├── execution/              ← Harness + LLM provider + context assembler
│   │   ├── state/                  ← event_log + issue_memory projection
│   │   ├── safety/                 ← Budget + loop + failure + mitigation
│   │   ├── tool/                   ← Skill registry + ToolExecutor + ToolResult
│   │   ├── rbac/                   ← Permissions + require_workspace + auto_scope listeners
│   │   ├── billing/                ← Stripe client + plans catalog + quota
│   │   ├── knowledge/              ← Defense Baseline + IssueMemory projection
│   │   ├── websocket/              ← Connection manager
│   │   └── plugins/                ← entry_points discovery
│   ├── seeds/                      ← Sample data seeder (idempotent)
│   ├── workflows/                  ← LangGraph DAG YAMLs (simple-fix-flow, …)
│   └── eval/                       ← Eval harness + judges + golden dataset
│
├── bumblebee_mcp/                  ← MCP server package
│   ├── auth.py                     ← API key → workspace + role
│   ├── tools.py                    ← 5 core MCP tools
│   ├── gemini_tools.py             ← 2 Gemini-backed tools (smart_create + ask)
│   ├── server.py                   ← stdio transport (Claude Desktop)
│   ├── http_server.py              ← Streamable HTTP (web clients, Cursor)
│   └── cli.py                      ← `python -m bumblebee_mcp.cli` entry
│
├── web/                            ← Next.js 16 frontend
│   ├── src/app/
│   │   ├── (public)/               ← Landing, /pricing, /login, /register
│   │   ├── (app)/                  ← Authed: dashboard, issues, settings/*, plugins, notifications
│   │   ├── auth/google/complete/   ← OAuth fragment-reader
│   │   ├── onboard/                ← 4-step wizard
│   │   └── layout.tsx              ← Root + ThemeProvider + QueryClient
│   ├── src/components/             ← React components (app shell, ui primitives, issues, theme)
│   ├── src/lib/                    ← API clients (api-client, billing-api, event-stream, …)
│   └── src/styles/tokens.css       ← Design system (light/dark CSS variables)
│
├── alembic/versions/               ← 5 migrations (initial → plugins → users → workspaces → oauth)
├── tests/                          ← 153 pytest tests
├── scripts/                        ← Operator scripts (backup, restore, release, stripe-setup, capture-*)
├── docs/                           ← Documentation (you're here)
├── plans/                          ← Plan files + research reports
├── references/                     ← Read-only reference projects (forge, nexus)
├── .claude/                        ← Claude Code hooks, skills, session state
├── .github/workflows/              ← CI (prompt-validator)
│
├── pyproject.toml                  ← Python package metadata + console_scripts
├── alembic.ini
├── docker-compose.yml              ← Local Postgres dev
├── docker-compose.prod.yml         ← Production deploy
├── Dockerfile                      ← Multi-stage prod image
├── CHANGELOG.md                    ← Release notes (parsed by /api/changelog)
├── CLAUDE.md                       ← Project instructions for Claude Code
└── .env                            ← LOCAL secrets. Gitignored. Never commit.
```

---

## Cheat sheet — "I want to … → open …"

| Goal | File |
|---|---|
| Fix REST endpoint `/api/issues/...` | `bumblebee/routers/issues.py` |
| Add a workspace setting | `bumblebee/models/workspace.py` + `bumblebee/routers/workspaces.py` |
| Tweak Triager agent's prompt | `bumblebee/prompts/triager.yaml` |
| Add a workflow DAG | `bumblebee/workflows/<name>.yaml` |
| Add an MCP tool | `bumblebee_mcp/tools.py` or `bumblebee_mcp/gemini_tools.py` |
| Add a web page | `web/src/app/(app)/<route>/page.tsx` |
| Change the design tokens | `web/src/styles/tokens.css` |
| Write a new migration | `alembic revision --autogenerate -m "..."` |
| Read migration history | `ls alembic/versions/` |
| Write a doc | `docs/<topic>.md` |
| Run tests | `pytest tests/test_<area>.py` |
| Start everything (Docker) | `docker compose -f docker-compose.prod.yml up` |

---

## What changed on 2026-05-22?

| Before | After |
|---|---|
| `D:/Source/bumblebee-v3/` (code) | `D:/Source/bumblebee/` (everything) |
| `D:/Source/Bumblebee-cli/` (docs/plans) | merged into above → deleted |
| `D:/Source/bumblebee/` (abandoned Go) | renamed to `D:/Source/bumblebee-legacy-go/` |
| 2 GitHub repos | 1 GitHub repo (`lct1407/bumblebee-ai`); `lct1407/Bumblebee-cli` archived readonly |
