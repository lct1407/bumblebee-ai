# Forge vs bb v3 — Side-by-side Comparison

**Date:** 2026-05-18
**Sources:** `references/forge/` (local clone, dated 2026-04-27, ~3 weeks old) — origin `github.com/SidCorp-co/forge`
**bb v3 plan:** `plans/260518-2010-bb-v3-multi-agent-concurrent/plan.md`

---

## 0. TL;DR

- **Forge** = production-ready single-agent project management. Multi-surface (cloud/desktop/mobile/widget). Mature but **agent is solo per task**.
- **bb v3** = novel multi-agent concurrent orchestrator. Single surface plan (CLI → web later). **Multiple agents per issue** is the differentiating feature.
- **They are not the same product.** bb v3 is not "rebuild forge" — it's a category step.
- **Adopt from forge:** Skills as first-class, AgentDefinition split, Memory usage tracking, Notifications entity, deploy integration fields baked in.
- **Don't repeat forge mistakes:** generic `failed` status, no event log (uses changeHistory JSON), no scope coordination, no budget ceilings, single-agent assumption.

---

## 1. What Forge Is

**Forge** = AI-powered project management platform with embedded Claude agent execution.

- **Backend:** Strapi 5 (TypeScript headless CMS) — content-types for Issue, Task, Comment, Project, Agent, AgentDefinition, AgentSession, ChatSession, Memory, Skill, Notification, UsageRecord
- **Surfaces (4):**
  - `web/` — Next.js cloud UI
  - `dev/` — Tauri desktop app
  - `app/` — React Native mobile (nativewind, metro)
  - `widget/` — Vite embeddable widget for customer products
- **Protocol:** REST `/api/*` + WebSocket `/ws` + MCP at `/mcp` (Streamable HTTP)
- **Providers:** Anthropic / OpenAI / Gemini (per-project default + per-agent override)
- **Concept:** Issue → Tasks (1-to-many child); single AgentSession per execution; chat-style messages JSON array

---

## 2. Entity-by-Entity Comparison

| Concept | Forge | bb v3 | Verdict |
|---|---|---|---|
| **Issue** | Status: 9 states (open/confirmed/approved/in_progress/resolved/closed/reopen/failed/needs_info). AI fields baked in (aiSummary/aiSuggestedSolution/aiAcceptanceCriteria/aiConfidence). Plan as text. ChangeHistory JSON. | Status: 12+ states (more granular: triaged/planned/developed/deploying/testing/staging/released). Scope hints. Acceptance criteria. Event-sourced history. | bb v3 more granular + replay-able; forge AI fields baked in (vs bb tools to write them) |
| **Task** | Separate entity, parent=Issue, status 5 states (backlog/todo/in_progress/in_review/done). | No separate Task — sub-Issue via parent_id self-FK. | Different model; forge's split is clearer for users, bb v3's unified is simpler |
| **Project** | Coolify/Sentry/webhook fields baked in. `knowledgeIndex` JSON opaque blob. `agentMemoryEnabled` toggle. | Project owns workflow defs + knowledge memory + policy config. Knowledge as first-class entity. | bb v3 cleaner separation; forge baked-in integration is convenient |
| **Agent** | First-class entity per project. `type` string. `promptTemplate`/`customInstructions`/`focusAreas`/`schedule`/`approvalMode`/`maxProposals`. Bound to AgentDefinition. | No Agent entity — role appears in workflow node. System prompts versioned by hash. | Forge richer agent customization; bb v3 simpler (role is workflow concept) |
| **AgentDefinition** | Template entity (type unique). One-to-many to Agent instances. | No equivalent. | **bb v3 should adopt** — useful for cloning specialist setups across projects |
| **AgentSession** | One session = one execution. `messages` JSON array (chat-style). `claudeSessionId` for resume. `repoPath`. `diff` JSON. `usage` JSON. Many-to-many to Issues. | One session = one phase (bounded). Workspace branch. Cost budget tracked. Many sessions per issue (chained). | Fundamentally different — forge=chat-session-style, bb=bounded-phase-style |
| **ChatSession** | Separate entity. Source: web/widget. For ad-hoc chat (not task-bound). | **Not modeled.** bb is issue-centric. | bb v3 intentionally skips chat surface |
| **Memory** | First-class. `userKey` (per-user), 3 categories: preference/context/correction. `useCount` + `lastUsedAt`. Source: auto/manual. | KnowledgeEntry (per-project), 4 categories: decision/convention/pitfall/fact. No use tracking yet. Plus Issue Memory projection. | Different angle: forge=user-pref-style, bb=project-fact-style. **bb v3 should add `useCount` + `lastUsedAt`** for relevance decay |
| **Skill** | First-class entity. `skillMd` richtext content + `files` JSON. `isGlobal` flag. Versioned. | **Not modeled** — skills baked into role prompts. | **bb v3 should consider** — Skill-as-data enables runtime evolution |
| **Comment** | Standard. | Standard. | Equivalent. |
| **Notification** | First-class entity. | **Not modeled** — only WS broadcast. | **bb v3 should add** for persistent notifications |
| **UsageRecord** | Cost tracking entity. | CostLedger (per-session/item/project scopes). | bb v3 more granular (3 scope levels vs 1) |
| **Workflow** | None — status transitions via Strapi lifecycle hooks (code). | **Workflow-as-data** (declarative graph JSON). | bb v3 distinctive — much more flexible |
| **ScopeLease** | None. | **Atomic file-glob claim** with conflict detection + heartbeat. | bb v3 distinctive — enables multi-agent concurrent |
| **Event Log** | `changeHistory` JSON array on issue (append, not canonical truth). | **Append-only canonical event log; views projected**. | bb v3 distinctive — replay-able |
| **Failure handling** | Generic `failed` status. AgentSession has status enum (idle/running/completed/failed). | **Failure taxonomy enum** routes per-cause mitigation. | bb v3 distinctive |
| **Budget caps** | UsageRecord tracks; no ceiling logic in schema. | **Hard per-session + per-item + per-project ceilings.** | bb v3 distinctive |
| **HITL** | `approvalMode`: preview / auto-create on Agent. | HITL as a tool call (`request_human_approval`). | Different mechanism; bb v3 more uniform |

---

## 3. The Fundamental Conceptual Difference

```
Forge model:
  Issue ──── 1 AgentSession ──── chat-style messages ──── done
            (one agent runs sequentially through the work)

bb v3 model:
  Issue ──── N AgentSessions (parallel + sequential)
              │
              ├── Coordinator (decomposes, supervises)
              ├── Implementer-Backend  (scope: api/auth/**)   ──┐
              ├── Implementer-UI       (scope: web/auth/**)   ──┤ parallel,
              ├── Tester               (scope: tests/auth/**) ──┤ scope-leased
              └── Reviewer             (Complex only)         ──┘
              chained via event log + Issue Memory
```

**Forge:** one agent, one session, one execution.
**bb v3:** N specialists, scope-leased, supervised, event-bridged.

This is **the** category-defining difference. Every other architectural choice in bb v3 (workflow-as-data, scope lease, event log, safety taxonomy) exists to support this concurrency model.

Forge cannot do bb v3's concurrent multi-agent without major rework. bb v3 cannot match forge's UX maturity without copying years of forge's surface work.

**They are not competing products.** Forge is "AI-assisted project management." bb v3 is "multi-agent execution platform that happens to use a task model."

---

## 4. What bb v3 Should Adopt From Forge (concrete updates to plan)

### 4.1 AgentDefinition entity (template/instance split)
**Why:** Allows runtime evolution of specialist roles without code changes. Project admins can clone and customize per-project.
**Add to v3 plan:** new entity `AgentDefinition` with `type` (unique), `promptTemplate`, `defaultTools`, `focusAreas`. Roles in workflow reference `AgentDefinition.type`.
**Phase:** 4 (when Coordinator + specialists materialize)
**Effort:** +1-2 days

### 4.2 Skill as first-class entity
**Why:** A "skill" can be a reusable capability bundle — files + skill.md + version. Forge has this; Claude Code has skills. bb v3 missing.
**Add to v3 plan:** new entity `Skill` with `name`, `description`, `version`, `skillMd`, `files`, `isGlobal`. Roles reference skills.
**Phase:** 6 (after core agents working, when specialization patterns emerge)
**Effort:** +2-3 days

### 4.3 Memory usage tracking (useCount, lastUsedAt)
**Why:** Project Knowledge can bloat. Decay by usage = simple relevance signal.
**Update v3 plan:** add fields to `KnowledgeEntry`. Context Assembler prefers recent-used. Background reaper archives entries unused for 90 days.
**Phase:** 6
**Effort:** +0.5 day

### 4.4 Notification entity
**Why:** WS broadcasts are ephemeral. Users need persistent notifications (mentions, completions, failures).
**Add to v3 plan:** new entity `Notification` (recipient, type, payload, read_at).
**Phase:** 7 (UI phase)
**Effort:** +1 day

### 4.5 Deploy/observability integration fields on Project
**Why:** Forge bakes in Coolify/Sentry/webhook fields. Pragmatic, saves a "config" abstraction.
**Update v3 plan:** add `deploy_config JSONB` + `observability_config JSONB` on Project, populated by users.
**Phase:** Already implicit in PolicyConfig; make explicit.
**Effort:** 0 (rename + structure)

### 4.6 Issue's `aiConfidence` field
**Why:** Forge tracks AI confidence on each issue (`aiConfidence` float). Useful signal — low confidence triggers human review.
**Add to v3 plan:** `Issue.ai_confidence` (computed by Triager). Used in Router for complexity classification.
**Phase:** 4
**Effort:** +0.5 day

---

## 5. What Forge Could (Eventually) Learn From bb v3

Not actionable for us, but useful framing:

1. **Workflow-as-data** instead of lifecycle hooks — separates orchestration from code
2. **Event sourcing** — replay-able sessions, debuggable failures
3. **Scope coordination primitive** — to enable multi-agent
4. **Failure taxonomy** with per-cause mitigation routing
5. **Hard budget ceilings** at multiple scopes
6. **Stateless reducer pattern** for sessions
7. **Issue Memory** as first-class projection

This list also doubles as "things bb v3 must not lose" during build.

---

## 6. What bb v3 Should NOT Copy From Forge

| Item | Why skip |
|---|---|
| Mobile (React Native app) | Out of scope v3.0; only fragment effort |
| Widget package | Out of scope; different product positioning |
| ChatSession entity | bb is issue-centric, not chat-centric |
| Strapi as backend | FastAPI better fit for our async/queue/event needs; don't pivot stack |
| Cron-based agent schedule (weekly/biweekly/monthly) | bb v3 is event-driven, not schedule-driven |
| `approvalMode: preview/auto-create` enum on Agent | bb v3 uses HITL as tool call (cleaner per 12-factor) |
| Per-agent `promptTemplate` field | bb v3 uses versioned prompts registry (better for evals + replay) |

---

## 7. Surface Comparison

| Surface | Forge | bb v3 plan | Note |
|---|---|---|---|
| Cloud web | ✓ Next.js | ✓ Phase 7 | bb v3 delays — risk |
| Desktop | ✓ Tauri | ✓ "Phase later or never" | bb v3 may skip — CLI daemon may suffice |
| Mobile | ✓ React Native | ✗ | bb v3 intentional |
| Widget | ✓ Vite embeddable | ✗ | bb v3 intentional |
| CLI | ✗ | ✓ Phase 1 | bb v3 distinct |
| MCP server | ✓ embedded in Strapi | ✓ Phase 1+ | Both have |

**Critique of bb v3 plan:** delaying web to Phase 7 is aggressive. Most adoption of agent platforms is web-first. CLI-only for 5 phases is a credibility gap. Worth reviewing.

---

## 8. Status Enum Comparison

**Forge Issue:** `open → confirmed → approved → in_progress → resolved → closed` (+ reopen, failed, needs_info)
**Forge Task:** `backlog → todo → in_progress → in_review → done`

**bb v3 Issue:** `new → triaged → planned → approved → in_progress → in_review → developed → deploying → testing → staging → released → closed` (+ failed, reopen, wont_fix, needs_info, blocked, on_hold)

**bb v3 is much more granular** — 12+ active states + 6+ terminal/side states. This is intentional: each status maps to a workflow node, which maps to a specialist role. Forge's enum is for humans.

**Trade-off:** bb v3's granularity is power for orchestration but cognitive load for UI users. UI Phase 7 must abstract this (e.g., group statuses into "stages": discovery / planning / execution / verification / shipped).

---

## 9. Stack Comparison

| Layer | Forge | bb v3 |
|---|---|---|
| Backend lang | TypeScript (Strapi 5) | Python (FastAPI) |
| ORM | Strapi document service | SQLAlchemy 2.0 async |
| DB | SQLite/Postgres (Strapi default) | Postgres (with SKIP LOCKED) |
| Auth | Bearer token | JWT + API key |
| WS | Strapi WS service | FastAPI WS |
| Frontend | Next.js + React | Next.js (existing) |
| Desktop | Tauri (Rust + TS) | Tauri (existing in v2) |
| Mobile | React Native | N/A |
| Test | Vitest | (TBD) |

**Choice point:** keep Python backend or pivot to TypeScript like forge? See §11.

---

## 10. Multi-tenancy & Auth

**Forge:** Project is the tenant boundary. Bearer token per user. `apiKey` per project. No multi-org.
**bb v3:** Single-org for v3.0 explicit anti-scope. Project is workspace boundary.

**Equivalent maturity** — neither has full multi-org. bb v3 is honest about it; forge architecturally allows but doesn't enforce.

---

## 11. Strategic Question: Should bb v3 Pivot to TypeScript Backend?

If goal is **clone-ability + ecosystem alignment with forge**, TypeScript backend has appeal:
- Single language across CLI + web + backend = simpler dev
- Strapi/NestJS/tRPC ecosystems for fast iteration
- Forge as direct reference for surface patterns

Argument **against pivot:**
- FastAPI + async SQLAlchemy + PG SKIP LOCKED is **the right stack** for queue-heavy multi-worker orchestration. TypeScript backend would be downgrade for that workload.
- v2 has 6+ months of Python investment in queue/orchestration logic — even rebuilding, that mental model is fastest in Python.
- Strapi 5 specifically: great for content/CRUD, **wrong tool for orchestration-heavy**. Forge's Strapi backend is the part with most custom code (services/agent/, services/websocket.ts) precisely because Strapi doesn't help with orchestration.

**Recommendation:** keep Python backend for bb v3. Stack churn = 4+ weeks lost. Reuse TypeScript for CLI + web (already the case).

---

## 12. Summary Recommendation

bb v3 plan is on the right track. **Forge is NOT a competitor; it's a sibling product with different positioning** (single-agent, multi-surface, mature) vs bb v3 (multi-agent concurrent, surface-conservative, novel).

**Plan updates from this comparison:**

| Adopt | Effort | Phase |
|---|---|---|
| AgentDefinition entity | +1-2d | 4 |
| Skill entity | +2-3d | 6 |
| Memory useCount + lastUsedAt | +0.5d | 6 |
| Notification entity | +1d | 7 |
| Issue.ai_confidence | +0.5d | 4 |

| Reconsider | Direction |
|---|---|
| Phase 7 web delay | Move web to Phase 4-5? CLI-only too long. |
| ChatSession not modeled | Confirm with user; some teams want chat surface |
| Mobile/widget anti-scope | Confirm: explicit no for v3.0? |

**Confidence:** High that bb v3 is genuinely different and worth building. Medium that adopting 5 forge concepts is right amount (could be more or less).

---

## Unresolved Questions

1. **Cross-pollination:** is forge actively developed? If yes, can we sync periodically? If no, freeze reference at current snapshot.
2. **Same author?** Both projects in same GitHub org likely (SidCorp). Strategy: position bb v3 as "next-gen execution engine" while forge is "production task PM"? Or merge eventually?
3. **Web Phase 7 risk:** is CLI-only acceptable for first 5 phases of dogfooding? Or move web earlier?
4. **Skill primacy:** is the Claude Code skill system (which forge mirrors) the right abstraction for bb v3 specialists, or is workflow node + system prompt sufficient?
5. **Memory bridge:** forge's user-keyed Memory + bb v3's project-keyed KnowledgeEntry serve different purposes. Should v3 add user-level memory too (Phase 7+)?

---

**Status:** DONE
**Summary:** Forge and bb v3 are different products with overlapping data models. bb v3's multi-agent concurrent architecture is genuinely novel. Adopt 5 forge patterns (AgentDefinition, Skill, Memory tracking, Notification, ai_confidence). Keep Python backend. Reconsider Phase 7 web delay.
