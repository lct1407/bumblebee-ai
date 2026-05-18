# Phase Status — Bumblebee v3

Live tracking of each phase from `docs/plan.md`. Updated as work progresses.

## Phase 0 — Greenfield scaffold ✅ COMPLETE

| Item | Status |
|---|---|
| New repo dir `bumblebee-v3/` | ✅ |
| Monorepo structure (api/, cli/, web/, workflows/, docs/, scripts/) | ✅ |
| `pyproject.toml` with deps (FastAPI, SQLAlchemy 2.0, LangGraph, alembic, ...) | ✅ |
| `.env.example` with industry defaults | ✅ |
| `docker-compose.yml` (PostgreSQL 16) | ✅ |
| `.gitignore` (Python + Node + DB + workspaces) | ✅ |
| `README.md` (quick start + architecture overview) | ✅ |
| Git init + initial commit | ✅ |

## Phase 1 — Single-agent E2E 🚧 PARTIAL (~70%)

| Item | Status | Notes |
|---|---|---|
| 14 SQLAlchemy models (Project, Issue, Comment, AgentDefinition, AgentSession, Skill, Workflow, WorkflowRun, ScopeLease, Event, ChatSession, KnowledgeEntry, Notification, Base) | ✅ | Full schema for all phases |
| Alembic env + initial migration | ✅ | Enums + tables + indexes + uniqueness |
| FastAPI app skeleton | ✅ | CORS, lifespan, version |
| Routers: projects / issues / events / workflow_runs / chat / health | ✅ | Full CRUD where applicable |
| Pydantic schemas (common, project, issue, event) | ✅ | More schemas added as routers expand |
| Event log (Plane 4) — append + query | ✅ | Append-only canonical |
| Workflow Engine (Plane 1) — LangGraph YAML loader | ✅ | StateGraph build; MemorySaver for now |
| TaskQueue (Plane 2) — PG SKIP LOCKED enqueue/claim/fail/reap | ✅ | Atomic claim with lease |
| Harness (Plane 3) — per-role stub outputs | 🟡 | Real claude-cli subprocess deferred |
| Tool Registry (Plane 6) — 12 tools, per-role filter, schema validate | ✅ | Single-verb discipline |
| Seed script (default project, 7 agent defs, 3 workflows, 5 knowledge, 3 issues) | ✅ | Runnable with `python -m src.seeds.seed_default` |
| 3 workflow YAMLs (simple-fix, feature-complex, chat-assistant) | ✅ | Loaded into DB by seed |
| TypeScript CLI (issue / run / chat / event) | ✅ | Build with `npm run build` |
| Smoke tests | 🟡 | health endpoint only |
| LangGraph PostgresSaver checkpointer | ⏳ | MemorySaver placeholder; swap in Phase 1.5 |
| Real LLM provider integration (claude-cli subprocess) | ⏳ | Harness stub emits canned outputs |

## Phase 2 — Safety + Observability 🚧 PARTIAL (~50%)

| Item | Status |
|---|---|
| BudgetEnforcer (Plane 5) — session/issue/project ceilings | ✅ |
| LoopDetector (Plane 5) — same tool+args repeat detection | ✅ |
| FailureClassifier (Plane 5) — rule-based taxonomy + mitigation | ✅ |
| CostTracker (Plane 7) — per session/issue/project aggregation | ✅ |
| OpenTelemetry trace emitter | ⏳ |
| Eval harness (golden dataset gate) | ⏳ |
| Kill switch endpoint | ⏳ |

## Phase 3 — Multi-issue ScopeLease 🚧 PARTIAL (~70%)

| Item | Status |
|---|---|
| ScopeLease model + status enum | ✅ |
| LeaseManager (acquire / heartbeat / release / reap) | ✅ |
| Glob overlap detection (prefix heuristic) | 🟡 | Conservative; full interval-tree later |
| Conflict queue for blocked acquires | ⏳ |

## Phase 4 — Web MVP + Coordinator ⏳ NOT STARTED

| Item | Status |
|---|---|
| Coordinator role (decomposition + integration) | ⏳ |
| Issue.ai_confidence used by Router | ✅ (model field) |
| Multi-specialist parallel dispatch | ⏳ |
| Integrator role (branch merging) | ⏳ |
| Next.js web app | ⏳ |

## Phase 5 — Failure taxonomy + mitigation 🚧 PARTIAL (~60%)

| Item | Status |
|---|---|
| FailureReason enum on AgentSession | ✅ |
| Rule-based classifier | ✅ |
| Per-failure mitigation routing dict | ✅ |
| Mitigation actuator (in workflow engine) | ⏳ |
| LLM-as-judge layer | ⏳ |

## Phase 6 — Knowledge + Skills + AgentDefinition 🚧 PARTIAL (~75%)

| Item | Status |
|---|---|
| KnowledgeEntry model with useCount + lastUsedAt | ✅ |
| AgentDefinition entity (template/instance split) | ✅ |
| Skill entity (capability bundle) | ✅ |
| Supersede chain | ✅ (model) |
| Context Assembler reads relevant entries per session | ⏳ |
| IssueMemoryProjector | ✅ (basic projection from events) |
| Decay reaper (archive entries unused 90d) | ⏳ |

## Phase 7 — ChatSession + Notifications + Replay UI 🚧 PARTIAL (~40%)

| Item | Status |
|---|---|
| ChatSession model | ✅ |
| Chat endpoints (start / send) | ✅ |
| Assistant role stub | ✅ |
| suggest_issue / suggest_knowledge_entry tools defined | ✅ |
| Notification model | ✅ |
| Notification endpoints | ⏳ |
| Replay debugger (event log → re-run) | ⏳ |
| Web chat sidebar | ⏳ |

## Phase 8 — Cutover ⏳ NOT STARTED

| Item | Status |
|---|---|
| Migration script from v2 (issue export) | ⏳ |
| Repo rename `bumblebee-v3` → `bumblebee` | ⏳ |
| v2 archive | ⏳ |

---

## What works end-to-end RIGHT NOW

If you complete the setup in `docs/getting-started.md`:

1. ✅ PostgreSQL DB up via docker compose
2. ✅ Alembic migration creates all 15 tables + 12 enums
3. ✅ Seed populates: 1 project, 7 agent definitions, 3 workflows, 5 knowledge entries, 3 issues
4. ✅ FastAPI server starts on :8000
5. ✅ `GET /health` returns ok
6. ✅ `POST /api/projects/bb/issues` creates an issue + emits `status_change` event
7. ✅ `POST /api/workflow-runs/trigger` creates a WorkflowRun + AgentSession + executes triager stub + emits events (session_started, llm_call, cost_charged, session_completed, workflow_completed)
8. ✅ `GET /api/events?issue_id=<uuid>` returns the event log
9. ✅ `POST /api/projects/bb/chat/sessions` creates a chat
10. ✅ `POST /api/projects/bb/chat/sessions/<id>/messages` runs Assistant stub + emits chat_message events
11. ✅ `bb issue list / create / show` via CLI
12. ✅ `bb run trigger <number>` triggers workflow
13. ✅ `bb event list` tails event log
14. ✅ `bb chat send` interacts with Assistant

## What's stub vs production

| Component | Stub or production? |
|---|---|
| Harness LLM call | **stub** — canned per-role outputs (Phase 1.5 swap to real claude-cli) |
| LangGraph node execution | **stub** — single-node triager runs; full graph traversal pending |
| Glob overlap detection | **prefix heuristic** — works for common cases; interval-tree later |
| Failure Classifier | **rule-based regex** — production-grade for known patterns |
| Cost calculation | **production** — rates per 1M tokens, multiple models |
| Event log | **production** — append-only PG, indexed, ready |
| Task Queue | **production** — SKIP LOCKED proven from v2 |
| Migration | **production** — alembic upgrade head works |
| Seed | **production** — runnable, idempotent (skips existing) |
| CLI | **production** for the 4 commands implemented |

## Path to full Phase 1 production

1. Replace `services/execution/harness.py` stub with real claude-cli subprocess
2. Swap LangGraph MemorySaver → PostgresSaver
3. Compile workflow graph at server startup, drive multi-node execution
4. Add OTel exporter
5. Add real eval golden dataset (20 representative issues with expected outputs)

Estimated: ~1 week to convert all Phase 1 stubs to production.
