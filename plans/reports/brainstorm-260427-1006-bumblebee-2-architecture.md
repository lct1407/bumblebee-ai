# Bumblebee 2.0 — Architecture Redesign

**Date:** 2026-04-27
**Type:** brainstorm summary → plan input
**Status:** approved by user, ready for `/ck:plan`

---

## 1. Problem Statement

Current bumblebee (v0.13.0) đang over-engineered + tích lũy tech debt:

- Status pipeline 15+ giá trị hardcoded với complexity routing, auto-skip, retry counters
- Pipeline orchestrator auto-trigger 12 phase mappings — logic phân tán
- Dual CLI (Python + TypeScript), dual daemon (Tauri Rust + Python) — maintain 2 codebase
- Phase tuần tự cứng (suggest→execute→test) — không tận dụng được multi-agent A2A
- Branch + PR không link rõ vào item — user không biết status merge
- Không có visual workflow builder — user không tự config flow
- Deploy/release trộn vào status pipeline

**Goal:** Asana/Jira-style task management + drag-drop workflow builder + Lead/specialist agent A2A + gitflow + Web UI ↔ CLI parity + foundation scale tốt.

---

## 2. Evaluated Approaches

### Approach A — Refactor in-place (incremental)
- Pros: không downtime, không mất data
- Cons: status alias tech debt còn, không pivot được sang workflow-as-data

### Approach B — Migrate to Strapi TS (như jarvis-agents)
- Pros: TS-everywhere, share types với web/cli
- Cons: rewrite 4 tuần backend, mất Python ecosystem (alembic, pydantic, MCP server)

### Approach C — Wipe + redesign trên FastAPI (CHỌN)
- Pros: clean schema, giữ Python ecosystem đã prod, focus thời gian vào engine + UI
- Cons: mất data dev (acceptable — chưa có user thật), 1 lần migration mạnh

**Quyết định:** **Approach C** — wipe DB + drop dual CLI/daemon + build workflow engine. CRG/MCP integration **defer sang v2.1**.

---

## 3. Final Architecture

### 3.1 Stack

| Layer | Tech | Note |
|-------|------|------|
| Backend | FastAPI Python (giữ) | Tái dùng auth/WS/MCP code |
| DB | PostgreSQL + Alembic | Reset migrations |
| Workflow engine | Custom asyncio (~600 LOC) | Không Temporal — overkill |
| CLI | `cli-ts` only | Drop `cli/` Python |
| Worker | Tauri daemon main + `bb daemon` alt | 2 wrapper, 1 logic qua dequeue API |
| Web | Next.js 16 + React Flow v12 | Workflow builder + run viewer |

### 3.2 Database — 12 bảng (clean slate)

```
Identity:        users, projects, project_members
Work tracking:   work_items, work_item_events, comments, attachments
Workflow engine: workflows, workflow_runs
Agent layer:     agent_definitions, agent_sessions, agent_messages
Worker layer:    devices, queue_items
```

**Bỏ hoàn toàn:** `pipeline_config`, `dev_event_history`, status aliases, retry counter columns, `agent_runs` cũ, `mcp_servers` (defer v2.1).

**`work_items` columns chính:**
```
id, project_id, number, type (epic|story|task|bug),
status, complexity (simple|complex), title, description,
parent_id, blocked_by_ids[],
branch_name, pr_url, pr_status (none|draft|open|merged|closed), worktree_path,
assignee_id, created_by, custom_fields (JSONB),
created_at, updated_at, deleted_at
```

### 3.3 Status lifecycle (7 status, kanban-friendly)

```
open → planned → in_progress → in_review → done
             ↓                       ↓
          blocked ←──── ←──── ←──── (retry)
                  cancelled (any)
```

Phase chi tiết (researching/coding/testing) **nằm trong `workflow_runs.current_node_ids`** — không phải status. Status đơn giản, workflow phong phú.

### 3.4 Workflow definition (data, not code)

```yaml
name: complex-feature
version: 1
nodes:
  - { id: start, type: trigger.status_change, config: { from: open, to: planned } }
  - { id: research, type: agent.run, config: { role: researcher, model: opus-4-7 } }
  - { id: lead_plan, type: agent.run, config: { role: lead, model: sonnet-4-6, input_from: [research] } }
  - { id: human_approve, type: human.approval, config: { auto_skip_if: "complexity==simple" } }
  - { id: code, type: agent.run, config: { role: coder, model: sonnet-4-6 } }
  - { id: parallel_check, type: agent.parallel, config: { branches: [reviewer, tester] } }
  - { id: open_pr, type: git.open_pr }
edges:
  - { from: start, to: research }
  - { from: research, to: lead_plan }
  - { from: lead_plan, to: human_approve }
  - { from: human_approve, to: code, when: approved }
  - { from: code, to: parallel_check }
  - { from: parallel_check, to: open_pr, when: all_pass }
  - { from: parallel_check, to: code, when: any_fail, max_loops: 2 }
```

### 3.5 Node types MVP (8 loại)

| Node type | Mục đích |
|-----------|----------|
| `trigger.{manual, item_created, status_change, schedule}` | Kích hoạt |
| `agent.run` | Spawn 1 Claude session với role + model + tools |
| `agent.parallel` | N agents song song, wait all |
| `condition.if` | Branch theo expression đơn giản (`field op value`) |
| `human.approval` | Pause, chờ user approve UI |
| `git.{branch, commit, open_pr, merge}` | Git ops |
| `update.{status, field}` | Mutate work item |
| `delay.wait` | Sleep N seconds |

### 3.6 Agent A2A model

```
Lead Agent (orchestrator)
  ├── Coder       (git, fs, bash, test)
  ├── Researcher  (web_search, codebase_search)
  ├── Reviewer    (read-only, gh pr review)
  └── Writer      (docs/, plans/)
```

- **Sync call:** Lead asks → wait response → continue (vd: ask Researcher root cause)
- **Async call:** Lead asks → continue → receive announcement (vd: trigger Coder, monitor)
- **Bidirectional `agent_links`:** Reviewer ↔ Writer trao đổi qua bảng `agent_messages`

### 3.7 3 orchestration modes

- **Auto** — Simple item: 1 Coder chạy thẳng plan→code→test→PR
- **Explicit** — Complex: Lead delegate, có human gate ở plan + review
- **Manual** — User trigger từng node qua UI/CLI

---

## 4. Web UI Redesign

### 4.1 Information architecture mới

```
/projects/[slug]
  ├── /board              — Kanban (default landing)
  ├── /list               — Hierarchy table với expand/collapse
  ├── /timeline           — Gantt
  ├── /items/[number]     — Detail full page
  ├── /workflows          — Workflow library (clone from 4 templates)
  ├── /workflows/[id]     — Drag-drop editor (React Flow)
  ├── /runs               — Workflow runs history
  ├── /runs/[id]          — Live graph viewer (running workflow)
  ├── /agents             — Agent definitions config (roles + models)
  ├── /devices            — Worker pool
  └── /settings           — Project + members
```

### 4.2 Item Detail Page — tabs mới

- **Activity** (events + comments — rebuild)
- **Branch & PR** (mới — branch name, commits, PR live status, "Open PR" button)
- **Workflow Run** (mới — mini graph + current node highlight + click → drawer)
- **Agent Sessions** (port từ cũ, refactor cho A2A messages)
- **Sub-items** (children + blocked_by chain visualization)

### 4.3 Workflow Run Viewer (live)

Same React Flow graph nhưng read-only:
- Node `pending` = gray
- Node `running` = blue pulse animation
- Node `done` = green checkmark
- Node `failed` = red X với error tooltip
- Click node → side drawer: agent session log + WS live stream output

### 4.4 Component library refactor

**New shared components:**
```
web/src/components/workflow/
  builder/
    workflow-canvas.tsx        — React Flow wrapper
    node-palette.tsx           — Drag source bên trái
    node-properties.tsx        — Form bên phải
    node-types/                — 1 component per node type
    edge-condition-editor.tsx  — When/condition picker
    workflow-validator.tsx     — Pre-save checks
  viewer/
    run-canvas.tsx             — Live read-only graph
    node-status-badge.tsx
    agent-session-drawer.tsx
  templates/
    template-picker.tsx
```

**Refactor existing:**
- `agent-stream-viewer.tsx` → adapt cho A2A multi-session
- `pipeline-progress.tsx` → DELETE (replaced by workflow run viewer)
- `agent-actions-bar.tsx` → simplify cho 3 modes (Auto/Explicit/Manual)

### 4.5 Design system updates

- Status colors: 7 status thay vì 15 → đơn giản palette
- Add: workflow node color coding (purple=agent, blue=condition, orange=human, gray=git, green=update)
- Branch/PR badges: draft/open/merged/closed với GitHub-style colors
- Complexity icons: simple (⚡) vs complex (🧩)

---

## 5. CLI Parity

```bash
# Project + items
bb item list/create/show/update/assign/children/delete
bb comment list/add

# Workflow
bb workflow list
bb workflow show <name>
bb workflow create <name> --from-template complex-feature
bb workflow edit <name>           # opens $EDITOR with YAML
bb workflow import <file.yaml>
bb workflow export <name>

# Run
bb item run <id> --workflow <name>
bb item status <id>               # shows current node
bb item approve <id> --gate <node_id>
bb item cancel <id>

# Worker
bb daemon                         # replaces both Python + Tauri
```

---

## 6. Built-in Workflow Templates (4 ship sẵn)

1. **simple-task** — 1 Coder agent (plan → code → PR). Auto mode default.
2. **complex-feature** — Researcher → Lead plan → human gate → Coder → Reviewer+Tester parallel → PR
3. **bug-fix** — Researcher (root cause) → Coder → Tester → PR
4. **spike-research** — Researcher → Writer (output to `docs/`)

---

## 7. Roadmap — 9 tuần, 7 phases

| Phase | Việc | Thời gian | Parallel-able |
|-------|------|-----------|---------------|
| **P0** Reset | Wipe DB + drop cli-Python + dual daemon + JSON archive | 3 ngày | — |
| **P1** Core data | Models + Alembic + CRUD APIs + auth | 1 tuần | — (foundation) |
| **P2** Workflow engine | YAML schema + executor + 8 node types + persistence | 2 tuần | Track A |
| **P3** Agent layer | Agent runner + A2A + WS streaming + worker daemon | 1.5 tuần | Track A continue |
| **P4** Web UI | React Flow builder + run viewer + 3 views + detail panel | 2.5 tuần | Track B (parallel với P2/P3) |
| **P5** CLI | bb workflow * + bb item run + bb daemon | 1 tuần | Track C (parallel với P4) |
| **P6** Test + polish | E2E test suite + 4 templates + GitHub webhook + docs | 1 tuần | — (final) |

### 7.1 Parallelization plan

```
P0 → P1 → ┬── P2 → P3 ──┐
          ├── P4 ────────┼── P6
          └── P5 ────────┘
```

- **Track A** (Backend engine): P2 → P3 (sequential)
- **Track B** (Frontend UI): P4 starts after P1 schema fixed — mock data first, integrate when P3 ready
- **Track C** (CLI): P5 starts after P1 — parallel với P4 (different file ownership)

**File ownership boundaries (cho parallel agent dev):**
- Track A: `api/src/workflow/`, `api/src/agents/`, `api/alembic/`
- Track B: `web/src/`
- Track C: `cli-ts/src/`

### 7.2 Validation milestones

- **End P1:** Postman collection chạy CRUD đủ — schema correct
- **End P3:** CLI command `bb workflow run sample.yaml` end-to-end với real Claude session — engine works
- **End P4:** User vẽ workflow trên web, save, run, watch live — UI works
- **End P5:** `bb` CLI parity 100% với web — feature parity verified
- **End P6:** Toàn bộ E2E test suite pass + 4 template demo OK — production-ready

---

## 8. Testing Strategy (P6 — chống "báo xong nhưng đầy lỗi")

### 8.1 Test pyramid

```
           ╱─────────────╲
          ╱   E2E (Playwright)   ╲     5%  — workflow vẽ → run → verify
         ╱─────────────────────────╲
        ╱  Integration (pytest)     ╲   25% — workflow run end-to-end
       ╱─────────────────────────────╲
      ╱   Unit (pytest + vitest)      ╲ 70% — node executor, CRUD, parsers
     ╱───────────────────────────────────╲
```

### 8.2 Test matrix bắt buộc cuối P6

**Backend (pytest):**
- Unit: mỗi node type executor có test riêng (8 node × 3 cases = 24 tests min)
- Unit: workflow validator (loop detection, missing edges, invalid expressions)
- Integration: workflow_run state persistence + resume after restart
- Integration: A2A message flow (Lead → specialist → reply)
- Integration: 4 templates chạy đủ với mocked Claude responses
- Load: 50 concurrent workflow_runs không deadlock DB

**Frontend (vitest + Playwright):**
- Unit: workflow validator client-side, node properties forms
- E2E (Playwright):
  1. Login → create project → create item → run simple workflow → verify done
  2. Open workflow editor → drag 5 nodes → connect → save → run → live viewer hiện đúng
  3. Complex flow với human gate → click approve → workflow continue
  4. CLI parity: `bb item create` → web hiện realtime qua WS

**CLI (vitest):**
- Unit: command parser, YAML I/O
- Integration: `bb workflow run` với mock API
- Smoke: `bb daemon` dequeue + heartbeat

**Regression suite:**
- 4 templates × 3 modes (Auto/Explicit/Manual) = 12 cases
- Mỗi case có golden output assertion
- Run trong CI mỗi PR

### 8.3 Acceptance criteria cho mỗi phase

Mỗi phase chỉ được merge khi:
1. ✅ All unit tests pass (coverage ≥ 70%)
2. ✅ Integration tests pass cho phase đó
3. ✅ Manual smoke test theo checklist phase
4. ✅ No new linter/type errors
5. ✅ `code-reviewer` agent đã review

### 8.4 CI/CD pipeline

```yaml
.github/workflows/test.yml
  on: [push, pull_request]
  jobs:
    backend-test:    pytest api/ --cov --cov-fail-under=70
    frontend-test:   vitest web/ + playwright e2e
    cli-test:        vitest cli-ts/
    regression:      python scripts/run-regression.py  # 12 template cases
    type-check:      mypy api/ + tsc web/ cli-ts/
```

### 8.5 Definition of Done (final P6)

- [ ] All 4 templates chạy end-to-end pass với real Claude API (smoke test thật)
- [ ] Web UI flow: login → create → board → run → done — không bug
- [ ] CLI parity: mọi action trên web đều có CLI command tương đương
- [ ] Migration script: `scripts/import-legacy.py` map data v0.13 → v2.0 OK (or explicit drop notice)
- [ ] Docs: `docs/workflows.md` + `docs/getting-started.md` rewrite cho v2
- [ ] Performance: 50 concurrent items, p95 dequeue < 500ms
- [ ] Zero TODO/FIXME/HACK markers trong code mới

---

## 9. Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Workflow engine reinvent wheel | Medium | Giới hạn 8 nodes MVP. Expression chỉ boolean ops. |
| React Flow learning curve | Medium | 1 dev focus 1 tuần riêng. Fallback: CLI YAML đủ dùng tạm. |
| Wipe DB = mất data | Low (dev only) | JSON archive trước drop. Rollback script trong 30 phút. |
| Workflow versioning conflicts | Medium | In-flight runs lock vào version cũ. Edit = create v+1. |
| Token cost blowup khi user chọn opus per node | Medium | Per-project budget cap + warning. CRG defer sang v2.1 sẽ giảm cost. |
| User config infinite loop | High | `max_loops` per edge + global `max_node_executions=50`. |
| Parallel dev tracks conflict | Medium | File ownership boundaries strict (`api/src/workflow/` vs `web/src/`). Daily sync. |
| "Báo xong nhưng đầy lỗi" | High | P6 testing strategy — DoD checklist + CI regression suite. |

---

## 10. Out of Scope (defer v2.1+)

- Code Review Graph (CRG) MCP integration → v2.1
- Smart Triage + Hotspot Dashboard (depend on CRG) → v2.1
- External MCP server attachment per project → v2.1
- Mobile app (React Native như jarvis-agents) → v3
- Multi-tenant SaaS deployment → v3

---

## 11. Success Metrics

- **Velocity:** Tạo + chạy 1 workflow new từ template ≤ 2 phút
- **Reliability:** 4 templates × 3 modes = 12 cases pass 100% trong CI
- **Token efficiency:** Lead+Coder+Reviewer flow trung bình ≤ 80k tokens (baseline trước CRG)
- **Parity:** 100% CLI commands có Web equivalent và ngược lại
- **Test coverage:** Backend ≥ 70%, Frontend ≥ 60%, CLI ≥ 70%

---

## 12. Next Steps

1. ✅ User approved (this document)
2. ⏭ Run `/ck:plan` → generate phase files vào `plans/260427-1006-bumblebee-2-architecture/`
3. ⏭ Execute P0 Reset → P1 Core → ... → P6 Test
4. ⏭ Journal entry mỗi phase complete

---

**Approved by:** user (2026-04-27)
**Ready for plan generation:** YES
