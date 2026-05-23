---
title: "Bumblebee v3 — From-Scratch Rebuild (Go + Postgres + Jira-style Next.js)"
description: "Greenfield rebuild. Phase 1 = task management (Jira-class). Phase 2+ = workflow executor + Claude CLI runner. References jarvis-agents + current Bumblebee."
status: pending
priority: P1
effort: "9 weeks (W0 bootstrap → W6 task-mgmt MVP → W9 agent layer + cutover)"
owner: "solo (ai006@grytt.co)"
branch: master (current repo) → new repo `bumblebee` after Phase 00
created: 2026-05-13
references:
  - D:\Source\jarvis-agents (reference, read-only)
  - D:\Source\Bumblebee-cli (current, will be archived to `bumblebee-legacy`)
---

# Bumblebee v3 — Rebuild Plan (260513-2204)

> **User-confirmed decisions (2026-05-13):**
> 1. Reset hoàn toàn — không kế thừa plan 260510-0547
> 2. Repo mới `bumblebee` (greenfield), current → `bumblebee-legacy` tag
> 3. UI **Jira-style** (enterprise, dense, customizable, custom fields, advanced filters, saved views)
> 4. Phase 1 = **task management only**. Agent layer từ Phase 02 trở đi (theo thứ tự phase, không phải song song)
>
> **User emphasis:** "đọc full code để hiểu qui trình của họ cho cẩn thận. Đặc biệt là cách stream giao diện, quản lý flow"
> → 4 researcher agents đang khảo sát sâu code jarvis + Bumblebee hiện tại. Reports landing tại `plans/reports/researcher-260513-2204-*.md`.

---

## 1. Stack (locked)

### Backend (Go)

| Layer | Choice | Rationale |
|---|---|---|
| Language | **Go 1.23+** | Single binary, low cold-start, easy ops |
| HTTP router | **chi v5** | Idiomatic, minimal, middleware-friendly |
| DB driver | **pgx v5** (no ORM) | Direct Postgres, fastest, type-safe |
| Query codegen | **sqlc** | SQL-first, no runtime reflection |
| Migrations | **golang-migrate** | Versioned, up/down, embeds via `embed.FS` |
| WebSocket | **nhooyr.io/websocket** | Modern, context-aware, RFC-compliant |
| Auth | **JWT (RS256)** only, single method | Drop dual-auth complexity from v2 |
| Validation | **go-playground/validator** | Tag-based, fast |
| Config | **envconfig** (Kelsey Hightower) | 12-factor |
| Logging | **slog** (stdlib) + JSON | Structured, no extra dep |
| Tracing | **OpenTelemetry** (optional, Phase 06) | Tempo/Jaeger-ready |
| Testing | **testify** + **dockertest** | Postgres integration tests against real DB |

### Frontend (Next.js)

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 16** (App Router, RSC) | Latest, streaming, server actions |
| Styling | **Tailwind CSS v4** | Lean utility, design-token first |
| Component library | **shadcn/ui** (Radix-based) | Accessible primitives, copy-not-install |
| State (server) | **TanStack Query v5** | Cache + invalidation + suspense |
| State (client) | **Zustand** (tiny, only when needed) | Cmd-palette, draft state |
| Forms | **react-hook-form** + **zod** | Type-safe, fast |
| Rich text | **TipTap** | Comment + description editor |
| Tables | **TanStack Table** | Sortable, dense, virtualized |
| DnD | **dnd-kit** | Kanban + reorder |
| Charts | **Recharts** (only Phase 06+) | Burndown |
| Icons | **lucide-react** | Single icon family |
| Cmd palette | **cmdk** (Vercel) | Linear-class search |

### Infrastructure

| Component | Choice |
|---|---|
| Database | **Postgres 16** (`db.sidcorp.co` existing) |
| Hosting | **Coolify** (existing infra, free) |
| CI | **GitHub Actions** (lint + test + build + deploy on tag) |
| Image registry | **GHCR** |
| Object storage (attachments) | **S3-compatible** (Minio on Coolify, Phase 05) |
| Secrets | **GitHub repo secrets** (CI) + **Coolify env** (runtime) |

---

## 2. Architectural decisions (locked)

### 2.1 Statuses — 6 (no aliases) + 1 side

**Phase 1 (task management):**

```
backlog → todo → in_progress → in_review → done
                                      ↘ cancelled
                  blocked  (side state, from any active)
```

| Status | Meaning | Transition rules |
|---|---|---|
| `backlog` | Created, not yet planned | → todo (assigned to sprint) |
| `todo` | Planned, ready to start | → in_progress (work begins) |
| `in_progress` | Active work | → in_review or blocked or cancelled |
| `in_review` | PR/QA pending | → done (approved) or in_progress (changes requested) |
| `done` | Completed, closed | terminal |
| `cancelled` | Won't do | terminal |
| `blocked` | External dependency | any active ↔ blocked |

**Phase 2+ extension (agent layer adds 2 more):**
- `running` (agent executing) — between `todo` and `in_review`
- `failed` (agent failed) — between `running` and `blocked` or terminal

Total target: **≤8 statuses**. Enforced via Postgres `CHECK` constraint + transition validator in service layer.

### 2.2 Workflow-as-data — YAML (deferred to Phase 05)

Drop the v2 hardcoded `pipeline_orchestrator.py` switch. Each project ships `.bumblebee/workflows/default.yaml` defining:

```yaml
# .bumblebee/workflows/default.yaml
name: default
triggers:
  - on: status_change
    from: todo
    to: in_progress
    runner: claude-cli
    skill: implement
  - on: status_change
    from: in_progress
    to: in_review
    runner: claude-cli
    skill: test
```

Workflow file = git-versioned. Edit = commit. No DB rows. Adopted from jarvis-agents pattern (research-confirmed).

### 2.3 Runner interface (Go, Phase 05)

```go
type Runner interface {
    Name() string
    Run(ctx context.Context, session *AgentSession, prompt string, stream chan<- Event) error
    Cancel(ctx context.Context, sessionID string) error
}

// Implementations (Phase 05-08)
type ClaudeCLIRunner struct { /* subprocess */ }
type GeminiVertexRunner struct { /* HTTP */ }
```

Only ClaudeCLIRunner in Phase 05. Gemini added Phase 07.

### 2.4 Real-time — Dual WebSocket pattern (adapted from jarvis-agents docs)

Two channels on single `/ws` endpoint:

1. **Broadcast** (no subscription needed) — cache invalidation events like `work_item:updated`, `sprint:created`. All connected clients receive. Wire to TanStack Query `invalidateQueries`.
2. **Session-targeted** (client sends `{type: "subscribe", sessionId}`) — agent stream events: `agent:text_delta`, `agent:tool_use`, `agent:complete`. Only subscribed clients receive.

Wire format (jarvis-proven, port to Go):
```json
{ "event": "work_item:updated", "data": { ... }, "timestamp": "2026-05-13T..." }
```

Reconnect strategy:
- Global hook: exponential backoff (1s → 30s, max 10)
- Session hook: fixed 2s
- Polling fallback (15s) if WS drops mid-agent-run

### 2.5 Data model — Jira-class extensibility

Core tables (Phase 02 schema):

```
users (migrated from v2)
organizations              -- multi-tenant ready
projects                   -- key prefix (e.g. "PROJ"), settings JSONB, workflow_id
sprints                    -- start/end, status, project_id
work_items                 -- THE big one (see below)
work_item_comments
work_item_attachments
work_item_links            -- relations: blocks, relates_to, parent_of, duplicates
work_item_events           -- audit log of every field change (for activity tab)
custom_fields              -- definitions per project
custom_field_values        -- (work_item_id, field_id, value JSONB)
saved_views                -- per-user JQL-lite saved filter + view mode
labels                     -- per-project
```

`work_items` columns (essentials):
- `id UUID PK`, `project_id`, `number INT` (per-project sequence, e.g. `PROJ-42`)
- `type` (`epic | story | task | bug | subtask`)
- `parent_id UUID NULL` (self-FK for tree)
- `title`, `description` (TipTap JSON)
- `status` enum + CHECK constraint
- `priority` (`low | medium | high | urgent`)
- `assignee_id`, `reporter_id`, `sprint_id NULL`
- `story_points NUMERIC NULL`, `due_date DATE NULL`
- `labels TEXT[]`
- `position NUMERIC` (for kanban order, gapped reposition)
- `session_context JSONB` (Phase 05+, for agent continuity)
- `created_at`, `updated_at`, `deleted_at NULL` (soft delete)

### 2.6 Web UI — Jira-style, ≤8 routes, ≤25 components

**Routes:**

| Route | Purpose |
|---|---|
| `/login` | Auth |
| `/projects` | Project list (org dashboard) |
| `/projects/[key]/board` | **Kanban** (default landing, Jira-style swimlanes) |
| `/projects/[key]/backlog` | Sprint planning (drag from backlog to sprint) |
| `/projects/[key]/timeline` | Gantt (zoomable: day/week/month) |
| `/projects/[key]/issues/[number]` | Issue detail (full page, two-column) |
| `/projects/[key]/settings` | Workflow, custom fields, members |
| `/search` | Global JQL-lite search results page |

**Component inventory (target ≤25):**

```
shell/         TopNav, ProjectSwitcher, BreadcrumbBar, GlobalSearchInput, NotificationBell, UserMenu
issue/         IssueCard, IssueDetail, IssueComments, IssueActivity, IssueTransitionMenu, IssueFields
views/         KanbanBoard, KanbanColumn, BacklogList, TimelineGantt, IssueTable
inputs/        FilterBar, FieldEditor, RichTextEditor (TipTap), AssigneePicker
overlays/      BulkActionsBar, CommandPalette, IssueQuickAdd, Toaster
realtime/      WSProvider, ConnectionIndicator
```

**Jira-style hallmarks (must-have):**
- Dense info layout (avatar + key + summary on single line)
- Inline edit everywhere (click field → edit, no modal)
- Custom fields with type system (text, number, date, select, multi-select, user, url)
- Saved filters with chips (`assignee = me AND status != done`)
- Bulk actions bar (multi-select rows → change status/assignee/sprint)
- Cmd+K command palette (jump-to-issue, run action)
- Keyboard shortcuts (`g+b` board, `g+l` backlog, `c` create, `/` search)

---

## 3. Phases (9 weeks)

| # | Week | Dates | Phase | Output | Status |
|---|---|---|---|---|---|
| 00 | W0 | 2026-05-14 → 05-20 | Bootstrap | New repo `bumblebee`, CI green, Coolify staging slot, secrets, hello-world `bb` binary deployed | pending |
| 01 | W1 | 2026-05-21 → 05-27 | API skeleton | Go chi+sqlc+pgx, JWT auth, users migrated, `/healthz` + `/api/me`, OpenAPI doc generated | pending |
| 02 | W2 | 2026-05-28 → 06-03 | Core schema + CRUD | All Phase-1 tables, full CRUD for projects/work_items/sprints/comments, soft delete, event log | pending |
| 03 | W3 | 2026-06-04 → 06-10 | WebSocket + real-time | Go `/ws` server, broadcast on lifecycle, client hook, exponential reconnect, polling fallback | pending |
| 04 | W4 | 2026-06-11 → 06-17 | Web UI: shell + Board + Backlog | Next.js 16 shell, Kanban DnD, Backlog sprint planning, all WS-reactive | pending |
| 05 | W5 | 2026-06-18 → 06-24 | Web UI: Timeline + Detail + Editing | Gantt, full issue detail page, inline edit, comments, attachments, activity tab | pending |
| 06 | W6 | 2026-06-25 → 07-01 | Jira-style advanced | Custom fields, saved views (JQL-lite parser), bulk actions, cmd palette, global search | pending |
| 07 | W7 | 2026-07-02 → 07-08 | **Agent layer phase A** — workflow YAML + Claude CLI runner | YAML executor, ClaudeCLIRunner subprocess, agent_session table, queue (SKIP LOCKED) | pending |
| 08 | W8 | 2026-07-09 → 07-15 | **Agent layer phase B** — streaming UI + CLI + MCP | Stream viewer (text_delta + tool_use grouping), `bb` CLI commands, MCP server for orchestration | pending |
| 09 | W9 | 2026-07-16 → 07-22 | Polish + migration + cutover | Sentry, perf budgets (<250KB initial JS), a11y audit, users migration script, DNS flip, runbook | pending |

**Buffer:** 1 day slack per phase (Fri). Phase 04-05 are the heaviest (UI delivery).

---

## 4. Success metrics

| Metric | v2 (current) | v3 target | Δ |
|---|---|---|---|
| Statuses (phase 1) | 14 + 7 aliases | 6 + 1 side | -67% |
| Web routes | 21 | 8 | -62% |
| Web components | 104 | ≤25 | -76% |
| Top-level packages | 5 (api+cli+cli-ts+web+desktop) | 2 (`bumblebee` Go binary + `web`) | -60% |
| Backend cold start | ~2s (Python) | <100ms (Go) | 20× |
| API binary size | n/a (Python) | <30MB | — |
| Initial JS (gzipped) | unmeasured | <250KB | budgeted |
| Time to first task event | unmeasured | <2s p95 | budgeted |
| Time to first Kanban paint | unmeasured | <500ms LCP | budgeted |
| Lifecycle enforcement | none (string field) | DB CHECK + service validator | — |

---

## 5. Migration (Phase 09)

- **Only `users` table migrated** from v2 (auth + profile). Password hashes kept (bcrypt-compatible).
- Everything else: fresh start. v2 prod kept read-only at `bumblebee.sidcorp.co/legacy` for 90 days.
- DNS flip weekend: **2026-07-18/19** (tentative — confirm with user).
- Rollback window: 7 days (DNS revert) after flip.
- Post W9+7d: forward-only.

---

## 6. Dependencies + Blockers

- 00 blocks all (repo + CI required)
- 01 blocks 02 (schema needs auth)
- 02 blocks 03 (lifecycle hooks need rows)
- 03 blocks 04 (web depends on WS for real-time)
- 04 blocks 05 (shell required before detail page)
- 06 blocks 07 (advanced UI patterns inform agent UI)
- 07 blocks 08 (executor required before CLI/MCP)
- 08 blocks 09 (CLI required for migration script)

---

## 7. Cost estimate

| Item | Monthly | Notes |
|---|---|---|
| Coolify hosting | $0 incremental | existing infra |
| Postgres | $0 incremental | existing `db.sidcorp.co` |
| S3 (Minio) | $0 incremental | self-hosted |
| Anthropic API (Phase 07+) | $0 incremental | existing Claude Max plan |
| Gemini Vertex (optional, future) | $5–15 | only if multi-runner used |
| **Total new** | **~$0–15/mo** | |

---

## 8. Open questions (BLOCKING — need user answer before Phase 00)

1. **GitHub repo location** — `grytt/bumblebee`? `sidcorp/bumblebee`? personal account `ai006/bumblebee`?
2. **Production domain** — `bumblebee.grytt.co`? `bumblebee.sidcorp.co`? new domain?
3. **Cutover weekend** — confirm 2026-07-18/19 (or later if scope expands)?
4. **Legacy retention** — 90 days read-only then hard-delete, OR keep indefinitely?
5. **Multi-tenancy in v3.0** — start with single-org and add `organizations` later, OR build multi-tenant from day 1?
6. **Mobile** — defer entirely to v3.x, OR include responsive web (no native app)?

---

## 9. Phase files

- [Phase 00 — Bootstrap](phase-00-bootstrap.md) — draft ready
- [Phase 01 — API Skeleton](phase-01-api-skeleton.md) — draft ready
- [Phase 02 — Core Schema + CRUD](phase-02-core-schema-crud.md) — pending researcher reports
- [Phase 03 — WebSocket + Real-time](phase-03-websocket-realtime.md) — pending researcher reports
- [Phase 04 — Web UI: Shell + Board + Backlog](phase-04-web-shell-board-backlog.md) — pending
- [Phase 05 — Web UI: Timeline + Detail + Editing](phase-05-web-timeline-detail-editing.md) — pending
- [Phase 06 — Jira-style Advanced](phase-06-jira-advanced.md) — pending
- [Phase 07 — Agent Layer A (Workflow + Runner)](phase-07-agent-workflow-runner.md) — pending
- [Phase 08 — Agent Layer B (Streaming UI + CLI + MCP)](phase-08-agent-stream-cli-mcp.md) — pending
- [Phase 09 — Polish + Migration + Cutover](phase-09-polish-migration-cutover.md) — pending

## 10. Research (all 4 reports COMPLETE — 2026-05-13)

- `../reports/researcher-260513-2210-jarvis-flow-pipeline.md` — Template+StatusFlowRule data-model, Runner interface (Health/CanHandle/Dispatch/Cancel), session_context JSONB, dedup window, reopen cap, dependency gates, queue protocol
- `../reports/researcher-260513-2210-jarvis-ui-streaming.md` — Dual-channel WS (broadcast + session), debounced cache invalidation, gorilla/websocket for Go, exp reconnect 1s→30s, no-auth notification channel, polling fallback 15s
- `../reports/researcher-260513-2211-bb-pipeline-orchestrator.md` — Python audit: KEEP (SKIP LOCKED, events log, heartbeat 90s, JSONB context), FIX (14 statuses → 8, DB CHECK transitions, idempotency keys, lease-based queue, build orchestrator that's missing in code)
- `../reports/researcher-260513-2211-bb-web-architecture-analysis.md` — Next.js audit: KEEP WSManager singleton (~75 LOC) + stream-viewer + hierarchy/kanban, consolidate 104→25 components, ADD advanced filters/swimlanes/custom fields/optimistic updates for Jira-class UX

**Key synthesis** → see Section 11 below.

## 11. Key research insights (synthesized for build)

### From jarvis-agents (patterns to ADOPT)
1. **Template-driven pipeline** (StatusFlowRule rows or YAML) — drop hardcoded switch statements
2. **Runner interface** with `Health() / CanHandle(skill) / Dispatch(ctx, session) / Cancel(id)` + error classification (transient/quota/unsupported/fatal)
3. **session_context JSONB** carries phase N output → phase N+1 prompt (no full re-prompt)
4. **Dedup window** (2 min) prevents thundering herd on rapid status changes
5. **Reopen cycle cap** (5 max) prevents infinite agent loops
6. **Dependency gates** — child must complete before parent advances; auto-retry on missing deps

### From Bumblebee v2 audit (mistakes to AVOID)
1. ❌ 14 statuses + 7 aliases (drop completely — clean 6 + 1 side in v3.0)
2. ❌ No DB-level transition enforcement (Go: Postgres ENUM + CHECK + service validator)
3. ❌ Non-atomic device load (Go: semaphore counter)
4. ❌ No idempotency keys (Go: unique index on `(work_item_id, phase, expected_status)`)
5. ❌ No queue reaper for crashed devices (Go: lease-based locking with reclaim job)
6. ❌ Orchestrator described in docs but **not in code** — build from day 1 in v3

### From jarvis WS + BB web streaming (port as-is)
1. **WSManager singleton** (~75 LOC pattern) — port directly to v3 web
2. **Dual-channel `/ws`** — broadcast for cache, session for streams
3. **Debounced cache invalidation** — batch 5 events / 100ms → 1 refetch (avoids cascade refetches)
4. **Stream viewer event grouping algorithm** — port as-is (handles orphaned tool results, block ordering, meta-event filter)
5. **Exponential backoff reconnect** 1s → 30s, 10 retries
6. **REST replay** of session events on page refresh (not WS replay)
7. **Add optimistic updates** (v2 weakness — race condition with WS) using TanStack Query mutations
8. **Query key hierarchy** `["work-items", slug, "tree", filters]` for broad invalidation

### Jira-class gaps to BUILD NEW (not in v2)
1. Advanced filter UI (custom fields, date ranges, JQL-lite parser, saved filters as chips)
2. Swimlanes persistence + multi-level grouping (e.g. by assignee within status column)
3. Inline custom field edit (click field → edit, no modal)
4. Bulk field mutations (multi-select → set custom field value)
5. Visual edit history diff (activity tab shows field-by-field before/after)
6. Cmd+K command palette (jump-to-issue, run-action)
7. Keyboard shortcuts (`g+b` board, `g+l` backlog, `c` create, `/` search)

### Existing research kept for reference
- `../260510-0547-bb-v3-rebuild/research/bb-v2-critical-audit.md`
- `../260510-0547-bb-v3-rebuild/research/jarvis-agents-architecture-analysis.md`
