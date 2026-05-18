# Getting Started — Bumblebee v3

This guide takes you from clone → working API + first workflow run.

## Prerequisites

- Python 3.12+
- Node 20+
- Docker + Docker Compose
- PostgreSQL client (optional, for inspection)

## 1. Database

```bash
cd D:/Source/bumblebee-v3
docker compose up -d
docker compose ps        # confirm bumblebee-db is healthy
```

## 2. API setup

```bash
cd api
python -m venv .venv
.venv\Scripts\activate     # Windows; on macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"

# Copy and edit env
copy ..\.env.example .env
# or: cp ../.env.example .env

# Run migrations
alembic upgrade head

# Seed default project, agents, workflows, knowledge, sample issues
python -m src.seeds.seed_default
```

You should see:
```
[ok] created project bb (<uuid>)
[ok] agent definition: triager
[ok] agent definition: coordinator
[ok] agent definition: implementer
... (7 total)
[ok] workflow: simple-fix-flow
[ok] workflow: feature-complex-flow
[ok] workflow: chat-assistant-flow
[ok] knowledge: ...
[ok] issue BB-1: Add /health/db endpoint
[ok] issue BB-2: Fix bcrypt cost factor too low
[ok] issue BB-3: Implement OAuth2 login (Google)
[done] seed complete
```

## 3. Start the API

```bash
uvicorn src.main:app --reload --port 8000
```

Visit:
- http://localhost:8000/health  → `{status: ok}`
- http://localhost:8000/docs    → Swagger UI

## 4. CLI

```bash
cd ../cli
npm install
npm run build
npm link

bb issue list
bb issue show 1
bb issue create "Add rate limiting" -t feature -p high

# Trigger workflow run on an issue (Phase 1 stub: triager only)
bb run trigger 1

# Tail event log
bb event list --limit 20

# Chat (Tier 2 stub)
bb chat start --title "exploration"
bb chat send <session_id> "what's the project structure?"
```

## 5. Direct API examples

```bash
# Create issue
curl -X POST http://localhost:8000/api/projects/bb/issues \
  -H "Content-Type: application/json" \
  -d '{"title": "test", "type": "task"}'

# List events for an issue
curl 'http://localhost:8000/api/events?issue_id=<uuid>&limit=20'

# Trigger workflow run
curl -X POST http://localhost:8000/api/workflow-runs/trigger \
  -H "Content-Type: application/json" \
  -d '{"issue_id": "<uuid>"}'
```

## What's working (Phase 1 stub)

- ✅ DB schema (14 entities, Alembic migration)
- ✅ FastAPI REST API for projects, issues, events, workflow runs, chat
- ✅ Append-only event log (canonical state, Plane 4)
- ✅ Workflow engine loader (LangGraph wrapper, Plane 1) — YAML → StateGraph
- ✅ Tool registry with 12 single-verb tools + per-role filtering (Plane 6)
- ✅ Harness stub (Plane 3) — emits structured events as if calling claude-cli
- ✅ Budget enforcer + loop detector + failure classifier (Plane 5, rule-based)
- ✅ Cost tracker (Plane 7)
- ✅ ScopeLease manager with glob overlap detection (Plane 2)
- ✅ Task queue with PG SKIP LOCKED (Plane 2)
- ✅ IssueMemory projector from event log (memory tier 5)
- ✅ ChatSession Tier 2 endpoint (Q&A + suggest)
- ✅ CLI minimum (issue / run / chat / event)
- ✅ Seed script with 7 agent definitions, 3 workflows, 5 knowledge entries, 3 sample issues

## What's stub / Phase 1.5+

- ⏳ Real claude-cli subprocess execution (replace stub in `services/execution/harness.py`)
- ⏳ LangGraph PostgresSaver checkpointer (currently MemorySaver)
- ⏳ Full LangGraph orchestration of multi-node workflows (currently only triager runs)
- ⏳ OTel trace emission
- ⏳ Eval harness (golden dataset)
- ⏳ Coordinator decomposition (Phase 4)
- ⏳ Real LeaseManager interval-tree (currently prefix-overlap heuristic)
- ⏳ Web UI (Phase 4)
- ⏳ Replay debugger (Phase 7)

## Troubleshooting

- **alembic upgrade head fails**: ensure PG is running (`docker compose ps`) and `.env` has correct `DATABASE_URL`.
- **`ModuleNotFoundError: src`**: run commands from `api/` directory after `pip install -e ".[dev]"`.
- **port 8000 in use**: `uvicorn src.main:app --port 8001`.
- **bb command not found**: ensure `npm link` succeeded; or run via `npm run dev -- issue list` from `cli/`.

## Architecture references

- `docs/plan.md` — full v3.0 plan (copy from `Bumblebee-cli/plans/260518-2010-bb-v3-multi-agent-concurrent/`)
- 7-plane architecture: `Bumblebee-cli/plans/reports/architecture-260518-agent-orchestrator-framework.md`
