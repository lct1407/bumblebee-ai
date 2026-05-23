# Bumblebee v2.0 — Deployment & Test Guide

> **Status:** Release Candidate (`v2.0-rc1` tag on `feat/v2-architecture` branch).
> v2 routes mounted under `/api/v2/*`. Legacy `/api/*` still active — no cutover yet.
> Use this guide to pull on a clean server and smoke-test before combining release.

---

## 1. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Python | 3.11+ | FastAPI backend |
| Node.js | 20+ (24+ recommended) | Web + CLI; native WebSocket needs 21+ |
| PostgreSQL | 14+ | Async asyncpg driver |
| Git | any | Clone + worktree |
| Claude Code CLI | latest | Real agent execution (`claude` on PATH) |
| Docker (optional) | any | Compose for one-shot dev env |

---

## 2. Clone & checkout

```bash
git clone https://github.com/<org>/bumblebee-cli.git
cd bumblebee-cli
git fetch origin
git checkout feat/v2-architecture          # or: git checkout v2.0-rc1
```

Confirm tag:
```bash
git log --oneline -1                       # should show 9c85537 feat(p3): ...
```

---

## 3. Backend (FastAPI)

### 3.1 Install
```bash
cd api
python -m venv .venv
source .venv/bin/activate                  # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3.2 Configure DB
Create a Postgres database, then set env (or `.env` file in `api/`):
```env
DATABASE_URL=postgresql+asyncpg://USER:PASS@HOST:PORT/bumblebee
JWT_SECRET=change-me-to-random-32-bytes
ANTHROPIC_API_KEY=sk-ant-xxx                  # for direct Claude API (optional)
GITHUB_WEBHOOK_SECRET=change-me                # only if using webhooks
```

### 3.3 Migrate
```bash
alembic upgrade head
```
Expected output: applies `0001_init_v2` (no-op) then `0002_v2_initial_schema` (14 tables).

### 3.4 Seed dev data
```bash
python -m scripts.seed_v2
```
Creates: 1 admin user (`admin@example.com` / `admin`), 1 project (`demo`), 4 agent definitions (lead/coder/researcher/reviewer).

### 3.5 Run
```bash
uvicorn src.v2_main:app --reload --host 0.0.0.0 --port 8000
```
Verify:
- `http://localhost:8000/docs` — OpenAPI shows v2 routes under `/api/v2/`
- `http://localhost:8000/health` — `{"status":"ok"}`

---

## 4. Web (Next.js)

```bash
cd ../web
npm install
```

`.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Dev:
```bash
npm run dev                                # http://localhost:3000
```

Build:
```bash
npm run build                              # for production deploy
npm start
```

Smoke test routes:
- `/projects/demo/workflows` — library with 4 templates
- `/projects/demo/workflows/<id>` — drag-drop editor (React Flow canvas)
- `/projects/demo/runs` — run history
- `/projects/demo/runs/<id>` — live run viewer

If backend is unreachable, UI auto-falls-back to mock data with `console.warn`.

---

## 5. CLI (`bb` command)

```bash
cd ../cli-ts
npm install
npm run build
npm link                                   # makes `bb` global
```

Configure:
```bash
bb auth login                              # email/password from seed
# or set env: export BB_API_URL=http://localhost:8000 BB_API_KEY=<key>
```

Smoke:
```bash
bb workflow list                           # 4 templates + user-created
bb workflow show simple-task --yaml
bb item list
bb item run BB-1 --workflow simple-task    # triggers a workflow_run
bb item status BB-1 --watch                # live tree via WS
bb daemon                                  # start worker that picks up queue
```

Without backend → falls back to mocks (warning logged).

---

## 6. Worker daemon

Two options — pick one per machine:

### Option A — Tauri desktop app
```bash
cd desktop
npm install
npm run tauri dev
```
Daemon registers as device, dequeues queue items, runs Claude subprocess.

### Option B — CLI daemon
```bash
bb daemon start --max-concurrent 2
```
Same dequeue endpoint, no UI.

---

## 7. Smoke test full loop

Once backend + web + cli + daemon are running:

1. **Create a work item** via web UI or `bb item create "Test feature"`
2. **Run a workflow** via web UI ("Run" button) or `bb item run BB-2 --workflow simple-task`
3. **Watch** live in web UI run viewer or `bb item status BB-2 --watch`
4. **Verify** in DB: `psql -c "SELECT id, status, current_node_ids FROM workflow_runs ORDER BY id DESC LIMIT 1"`

If the workflow uses `agent.run` nodes, the worker daemon will spawn `claude` CLI in a worktree at `~/.bumblebee/worktrees/demo/item-2/`.

---

## 8. Production deploy (Docker compose)

The repo has `Dockerfile.api`, `Dockerfile.web`, `docker-compose.yml`. v2 changes do NOT break compose.

```bash
docker compose up -d --build
```

For staging on Coolify, push the branch — existing `.github/workflows/deploy.yml` builds and deploys.

> **⚠️ Cutover note:** Legacy `/api/*` routes still mounted. Web/CLI default to `/api/v2/*`. Do NOT remove legacy yet — wait for full E2E pass + 1 week dogfood.

---

## 9. Tests

### Backend unit
```bash
cd api
pytest src/workflow/ -v                    # 44 workflow engine tests
pytest tests/v2/ -v                        # 34 agent + REST + webhook tests
```

### Web build
```bash
cd web
npm run build
npx tsc --noEmit
```

### CLI build
```bash
cd cli-ts
npm run build                              # tsup
npm test                                   # vitest
npx tsc --noEmit
```

---

## 10. Known gaps (NOT done in this RC)

| Gap | Workaround | Will fix in |
|-----|------------|-------------|
| Real Claude smoke (4 templates × 3 modes) | Manual run | Post-merge session |
| Playwright E2E suite | Manual UI verify | P6 follow-up |
| Tauri Rust daemon refactor for v2 | Use `bb daemon` instead | Post-merge |
| Cost calc from Claude tokens | `cost_usd=0` placeholder | Add pricing table later |
| Legacy `/api/*` cutover | Both APIs run side-by-side | After 1-week dogfood |
| Migration of legacy data → v2 schema | Run `api/scripts/export_legacy.py` from `legacy/v0.13-pre-v2` tag, manual map | Optional |

---

## 11. Rollback plan

If v2 breaks staging:
```bash
git checkout legacy/v0.13-pre-v2           # snapshot tag
# OR
git revert <merge-commit>                  # if merged into release/dev
docker compose up -d --build
```
DB rollback:
```bash
alembic downgrade base                     # drops v2 tables (legacy data preserved if exported)
# Restore from JSON archive if needed:
python api/scripts/import_legacy.py archive/legacy-2026-04-27.json
```

---

## 12. Reference

- Architecture redesign brainstorm: `plans/reports/brainstorm-260427-1006-bumblebee-2-architecture.md`
- Phase plans: `plans/260427-1006-bumblebee-2-architecture/phase-{00..06}-*.md`
- Workflow concept + 4 templates: `api/src/workflow/templates/*.yaml`
- Engine internals: `api/src/workflow/`
- Agent layer: `api/src/agents/`
