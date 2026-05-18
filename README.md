# Bumblebee v3 — Multi-Agent Concurrent Task Management

> Multi-agent AI orchestration platform. Multiple specialist agents work concurrently on the same project via scope-leased file claims, supervised by a Coordinator agent, with canonical event-sourced state.

**Status:** Phase 0 scaffold (alpha) — under active development.
**Plan:** see `docs/plan.md` (copied from `Bumblebee-cli/plans/260518-2010-bb-v3-multi-agent-concurrent/plan.md`).

## Quick Start

```bash
# 1. Bring up PostgreSQL
docker compose up -d

# 2. Set up Python env
cd api && python -m venv .venv && .venv\Scripts\activate
pip install -e .

# 3. Run migrations
alembic upgrade head

# 4. Seed default data
python -m src.seeds.seed_default

# 5. Start API
uvicorn src.main:app --reload --port 8000

# 6. Try CLI
cd ../cli && npm install && npm run build && npm link
bb issue create "fix auth bug"
bb issue list
```

## Architecture (7-plane)

1. **Control** — LangGraph workflow engine + Coordinator + Router + HITL
2. **Dispatch** — PG SKIP LOCKED queue + LeaseManager + worker pool
3. **Execution** — Harness (context + tools + LLM) + Subagent firewall + Workspace
4. **State** — Event log (canonical) + Checkpoints + Materialized views
5. **Safety** — BudgetEnforcer (3 scopes) + LoopDetector + FailureClassifier + KillSwitch
6. **Tool** — Single-verb tool registry + MCP server + ProvenanceTags
7. **Observability** — OTel traces + Cost tracker + Eval harness + Replay debugger

## Stack

- **Backend:** Python 3.12, FastAPI, async SQLAlchemy 2.0, asyncpg, Alembic, LangGraph
- **Database:** PostgreSQL 16 with SKIP LOCKED queue
- **CLI:** TypeScript (npm package)
- **Web:** Next.js 16 + Tailwind v4 + shadcn/ui (Phase 4)
- **Workers:** Tauri desktop daemon OR CLI daemon

## Repository Layout

```
api/        FastAPI backend, 7-plane services, Alembic migrations
cli/        TypeScript CLI (`bb` command)
web/        Next.js dashboard (Phase 4)
workflows/  Declarative YAML workflows (loaded into LangGraph)
docs/       Architecture, plan, guides
scripts/    Dev tooling
```

## Phase Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Greenfield scaffold | ✅ done |
| 1 | Single-agent E2E + event log | 🚧 in progress |
| 2 | Safety + observability | ⏳ |
| 3 | Multi-issue ScopeLease | ⏳ |
| 4 | Web MVP + Coordinator | ⏳ |
| 5 | Failure taxonomy | ⏳ |
| 6 | Knowledge + Skills + AgentDefinition | ⏳ |
| 7 | ChatSession + Notifications + Replay UI | ⏳ |
| 8 | Cutover | ⏳ |

## License

Proprietary — internal SidCorp project.
