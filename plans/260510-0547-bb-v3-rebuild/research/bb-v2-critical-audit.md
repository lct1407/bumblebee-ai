# Bumblebee v2 Critical Audit

Source: D:\Source\Bumblebee-cli (current state, branch master, post-v2.0-rc1).
Verdict: **rebuild justified IF scope tighter**. Avoid Second System Syndrome — every feature starts at "not present" and is added on demand.

## Pain points

### 1. Four packages, sparse differentiation
- `api/` (Python FastAPI), `cli-ts/` (TypeScript), `web/` (Next.js), `desktop/` (Tauri).
- Python CLI (`cli/`) AND TypeScript CLI (`cli-ts/`) both maintained. No deprecation path stated.
- Cost: dual code paths for every CRUD operation; drift inevitable.

### 2. 14+ statuses + 7 legacy aliases
- Active set: new, triaged, planned, approved, in_progress, in_review, developed, deploying, testing, staging, released, closed, failed, reopen, plus side: wont_fix, needs_info, blocked, on_hold.
- Aliases baked into validation: open=new, confirmed=triaged, backlog=new, todo=triaged, resolved=done, closed=done, cancelled=wont_fix.
- ~35 transitions. No DB-level enforcement; any endpoint can set any status.

### 3. Pipeline orchestrator brittle
- No idempotency lock — same item+phase can be enqueued twice in race.
- Retry logic explosive (auto-reimplement max 3 + auto-fix max 5 = 15 retries possible).
- Status update + agent_session create + queue enqueue not transactional.

### 4. Multi-model is illusion
- `phase_routing` JSONB exists in projects table.
- MCP tools hardcode Claude.
- No `Runner` abstraction; subprocess invocations scattered across codebase.
- No UI provider picker.

### 5. Knowledge base is vapor
- CLAUDE.md references "knowledge base" repeatedly.
- No `knowledge` DB table, no MCP tool to write entries, `rag_service.py` is a stub returning empty list.
- Skills mention "Read knowledge.md" but file does not exist in projects.

### 6. Worktree single-machine
- ~2 concurrent semaphore in daemon.
- No distributed coordination; two daemons would collide on same worktree path.
- Git lock conflicts likely under load.

### 7. MCP is API wrapper, not orchestration
- Only CRUD tools (work_items, comments, sprints, agent_sessions).
- No agent phase trigger tool, no streaming.
- Defeats the point — Claude Code can call `bb agent suggest` only via Bash.

### 8. Web UI over-engineered
- 21 routes (`/projects/[slug]/{items,board,sprints,agent,agent/runs,agent/runs/[id],pipeline,queue,devices,settings,settings/pipeline,settings/providers,epics,...}`).
- 104 components in `web/src/components/`.
- Six+ detail panel variations (sheet, full page, hierarchy, kanban-card, timeline-bar, mini).

### 9. Tech debt baked in
- Legacy aliases permanent (no removal date).
- Dual auth (JWT + X-BB-API-Key) on every endpoint.
- GraphQL + REST + MCP triple surface.
- v1 routes still mounted alongside v2 — no cutover scheduled.

### 10. No lifecycle enforcement
- Status field is plain string, no enum + check constraint.
- Transition validator absent; agents can skip phases (e.g. draft → released directly).
- No audit invariants.

## Rebuild requirements

1. **One language for backend+CLI+MCP** (Go) — kills dual-CLI drift.
2. **Status enum + transition CHECK constraint** at DB level — zero invalid states possible.
3. **Workflow + skills externalized** — change behavior without code changes.
4. **Runner interface from day 1** — no hardcoded Claude.
5. **Knowledge as files** — testable, gitable, reviewable.
6. **MCP exposes orchestration**, not just CRUD — `task_run`, `task_advance`, streaming.
7. **Web UI: 8 screens max**, no premature variations.
8. **Single auth method** (JWT only).
9. **No legacy aliases** — clean slate.
10. **Idempotency keys** on phase dispatch.

## What to migrate
- `users` table only (auth + profile).
- Everything else: fresh.
