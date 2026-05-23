# Bumblebee v3 — Multi-Agent Concurrent Task Management Platform

**Date:** 2026-05-18
**Status:** Plan v1.1 — design locked. Plugin-ready + full-stack pypi added. Ready for Phase 0.
**Target repo:** `bumblebee` (new repo, sibling to current `Bumblebee-cli/`)
**Reference docs:**
- `plans/reports/architecture-260518-agent-orchestrator-framework.md` — 7-plane reference architecture
- `plans/reports/researcher-260517-2010-agent-architecture-standards.md` — production agent standards research
- `plans/reports/researcher-260518-0112-knowledge-systems-for-agents.md` — wiki/RAG/memory standards 2026
- `plans/reports/brainstormer-260517-2010-bb-v3-architecture.md` — v2 audit + top-5 fixes
- `plans/reports/comparison-260518-0125-forge-vs-bb-v3.md` — forge vs bb v3 differential analysis
- `plans/reports/brainstormer-260518-1725-bb-v3-extensible-framework.md` — plugin-ready + pypi distribution addendum

---

## 0. Vision

A task management platform where a **project** is a shared workspace, and **multiple AI agents work on it concurrently**. Users file issues; the system decomposes, distributes, and coordinates — multiple specialist agents claim non-overlapping file scopes, execute in parallel git worktrees, share knowledge via an event-sourced project memory, and integrate results back.

Built on **LangGraph** (workflow engine) + **FastAPI** (Python backend) + **PostgreSQL** (event log + queue) from day one, around the 7-plane reference architecture: workflow-as-data control plane, scope-leased dispatch, harness-owned execution, canonical event log, hard safety ceilings per session/issue/project, strict-schema tools, full traces + evals.

Not a refactor of bb v1+v2 — **clean break, new repo `bumblebee`**. Data extraction from v2 only where useful.

**Extensibility:** plugin-ready via Python `entry_points`. New automation domains (deploy, payment, data pipelines) = ship a pypi package, zero core changes. **Full-stack pypi distribution** — `pip install bumblebee-ai` provides server + worker daemon + Python CLI. TS CLI extensions (npm) reserved for Phase 6+.

---

## 1. What's Fundamentally Different From v2

| Dimension | v2 (current) | v3 (new) |
|---|---|---|
| Concurrency unit | One agent per issue at a time | **Multiple agents per issue + multiple issues in parallel** |
| Coordination | Status field drives sequential phase chain | **Coordinator (supervisor) agent decomposes & dispatches specialists** |
| File safety | Worktree per issue (only) | **ScopeLease** — atomic claim on file globs; conflict-aware |
| State of truth | DB rows + WS stream (parallel) | **Event log = canonical**; rows + WS are derived views |
| Workflow engine | Hardcoded status hooks + dual orchestrator | **LangGraph StateGraph** loaded from declarative JSON |
| Failure handling | Single `failed` status, blanket reimplement | **Failure taxonomy** routes mitigation per cause |
| Cost safety | Project-per-day warning | **Hard ceilings per session/issue/project**, all three |
| Quality gate | Manual review for Complex | **Eval suite as deploy gate**, every prompt change tested |
| Tool surface | 16 multi-verb MCP tools | <10 single-verb tools, examples in defs, lazy-load above |
| Knowledge | Comments + session_context JSONB | **Multi-tier memory** (working/compaction/scratch/checkpoint/IssueMemory/ProjectKnowledge) |
| Chat surface | Indirect via agent stream | **ChatSession Tier 2** (Q&A + suggest-style writes via HITL) |
| Agent definition | Hardcoded roles | **AgentDefinition** entity (template) + Skill entity (capability bundle) |
| Extensibility | Hardcoded subsystems | **Plugin-ready** via `entry_points`; new domain = pypi package, no core change |
| Distribution | Source-only deploy | **Full-stack pypi** — `pip install bumblebee-ai` = server + daemon + CLI |

---

## 2. Core Abstractions

### 2.1 Project
Shared workspace. Owns: monorepo path, issue backlog, workflow definitions (LangGraph configs), knowledge memory, policy config (budget ceilings, concurrency limits, eval gates).

### 2.2 Issue
Unit of intent. Hierarchical via `parent_id` self-FK. Fields: type, status, priority, scope hints (suggested file globs), acceptance criteria, blocking deps, complexity, `ai_confidence` (Triager's confidence; low → forced human review).

### 2.3 Workflow
Declarative graph (JSON). Nodes = phases (mapped to LangGraph nodes); edges = conditional transitions. Versioned. Loaded into LangGraph StateGraph at runtime.

### 2.4 WorkflowRun
Live LangGraph execution instance against an issue. State persisted via LangGraph checkpointer (PG). Resumable.

### 2.5 AgentSession
One specialist agent doing one phase. Carries: role (from AgentDefinition), workspace branch, provider, context budget, cost budget, status, failure_reason enum if failed.

### 2.6 AgentDefinition  ⭐ **(adopted from forge)**
Template defining a role: `type` (unique), `promptTemplate` (versioned by hash), `defaultTools`, `focusAreas`, `defaultBudgets`. Per-project Agent instances reference an AgentDefinition; can override prompts/tools per project.

### 2.7 Skill  ⭐ **(adopted from forge)**
Capability bundle: `name`, `description`, `version`, `skillMd` (markdown content), `files` (JSON of file references), `isGlobal` flag. AgentDefinitions reference Skills. Enables runtime evolution without code changes.

### 2.8 ScopeLease  ⭐ **(novel primitive)**
Atomic claim on file globs for a session. Exclusive within glob overlap. Heartbeat-refreshed, revocable. Released on session complete/fail. **This is what makes multi-agent concurrent on same project safe.**

### 2.9 Event
Append-only canonical record. Every meaningful state change: llm_call, tool_call, lease_acquired/released, status_change, decision, knowledge_added, cost_charged, chat_message. Carries `causation_id` (DAG of causality).

### 2.10 ChatSession  ⭐ **(Tier 2, adopted from forge)**
Persistent conversational interface to project. Source: web (CLI may follow). Tier 2 = Q&A + light write (suggest issues/knowledge, with HITL confirmation). Single `Assistant` agent role; read tools + suggest tools. Events tagged `source=chat`.

### 2.11 KnowledgeEntry  (with forge adoptions)
Project memory. Categories: decision / convention / pitfall / fact. Supersede chain. **`useCount` + `lastUsedAt`** fields for relevance decay. Visible by role/scope.

### 2.12 Notification  ⭐ **(adopted from forge)**
First-class entity (recipient, type, payload, read_at). Persists beyond WS broadcasts. Triggered by: session complete/fail, mention, eval failure, budget warning.

### 2.13 PluginRegistration  ⭐ **(v1.1 extensibility)**
Light tracking entity for plugins discovered via Python `entry_points`. Fields: `name`, `version`, `manifest` (workflows/agents/skills/tools refs), `loaded_at`, `status` (active / failed / disabled), `error_message`. Re-populated on startup. Enables `bumblebee plugins list/reload`.

**Out of scope (explicit):**
- Vector DB / embeddings — 2026 research confirms structured + BM25 is correct default; add only on measured retrieval failure
- Mobile app (React Native)
- Embeddable widget
- ChatSession Tier 3 (chat as orchestration control surface)
- Multi-tenant org features (single-org for v3.0)
- Plugin marketplace UI, sandboxing, signing — basic entry_points loader only for v3.0
- TS CLI extensions (npm) actual implementation — namespace reserved, build Phase 6+

---

## 3. The 7 Planes — Concrete Subsystems

Implementation map of `architecture-260518-agent-orchestrator-framework.md`.

### Plane 1: Control — `services/control/`
- **WorkflowEngine** — wraps LangGraph; loads JSON workflow → builds StateGraph; evaluates transitions
- **Coordinator** (supervisor agent) — for issues needing decomposition: splits into sub-issues, dispatches specialists, integrates results. Itself an AgentSession of role=`coordinator`.
- **Router** — classify issue (Simple/Medium/Complex) using `ai_confidence` → pick workflow variant.
- **HITL Gate** — tool call (`request_human_approval`), not a special status.
- **Decision Log** — every transition writes Event(type=decision_taken).
- **ChatHandler** — entry point for ChatSession; routes user messages to `Assistant` AgentSession.
- **PluginLoader** ⭐ **(v1.1)** — `services/plugins/loader.py`. Discovers `bumblebee.plugins` entry_points at startup; registers workflows/agents/skills/tools from each plugin manifest. Failure-isolated (1 plugin crash ≠ server crash). Re-runnable via `bumblebee plugins reload`.

### Plane 2: Dispatch — `services/dispatch/`
- **TaskQueue** — PostgreSQL SKIP LOCKED (proven from v2).
- **WorkerRegistry** — devices with capabilities + heartbeat.
- **LeaseManager** — ScopeLease acquire/release/extend/revoke. Conflict detection via interval-tree on glob patterns; pre-resolve globs to file sets at lease time.
- **DLQ + Reaper** — stale leases revoked; stale claims re-enqueued.

### Plane 3: Execution — `services/execution/`
- **Harness** — bb-owned wrapper around provider (claude-cli / gemini-cli / etc).
  - Context Assembler: pulls AgentDefinition prompt + Skill references + relevant KnowledgeEntries + Issue Memory + scope summary + role-specific tools. Budgeted.
  - Tool Dispatcher: validates against registry, executes, compacts result.
  - Subagent Spawner: when role needs depth, spawn child session with fresh context, return summary only.
- **WorkspaceManager** — git worktree per session under `~/.bumblebee/workspaces/{project}/{issue}/{role}/`. Branches: `{issue-key}/{role}`.
- **ProviderAdapter** — adapter pattern per LLM provider.

### Plane 4: State — `services/state/`
- **EventLog** — append-only `events` table. Indexed by `(issue_id, occurred_at)`. Sole source of truth.
- **LangGraph Checkpointer** — uses PG (LangGraph's PostgresSaver). WorkflowRun state persisted natively. **Note:** event log + checkpointer overlap by design; events capture *everything*, checkpoints capture *resumable state snapshots*.
- **MaterializedViews** — `issues`, `agent_sessions`, etc. Rebuildable from event log.
- **IdempotencyTable** — every external side effect tagged with key; replay-safe.

### Plane 5: Safety — `services/safety/`
- **BudgetEnforcer** — checks before every LLM call (see §12 for default values):
  - per-session: max_tokens, max_wallclock, max_dollars
  - per-issue: max_retries, max_cycle_count, max_dollars
  - per-project: hourly_dollar_cap, daily_dollar_cap
- **LoopDetector** — same tool + args in last N calls → break, classify `infinite_loop`.
- **FailureClassifier** — taxonomy: `hallucination | tool_error | context_exhaust | goal_drift | infra | planning_brittleness | timeout | budget_exceeded`. Rule-based first; LLM-as-judge layer added when measured needed.
- **GoalReanchor** — every M turns, restate primary goal in working context.
- **KillSwitch** — operator endpoint halts session in <5s.

### Plane 6: Tool — `services/tool/`
- **ToolRegistry** — versioned single-verb defs. Strict schema. Examples mandatory.
- **SchemaValidator** — reject invalid calls + return hint.
- **MCPServer** — exposes registry to external (Claude Code, other agents).
- **ToolSearch** — when registry > 10 active, search-then-call pattern.
- **ProvenanceTagger** — tool results tagged `verified | inferred | user_input | external_unverified`.
- **SuggestTools** — `suggest_issue`, `suggest_knowledge_entry` for chat role (creates draft → HITL confirms).

### Plane 7: Observability — `services/obs/`
- **TraceEmitter** — OpenTelemetry compatible. Span per session, sub-spans per LLM/tool call.
- **CostTracker** — real-time per session/issue/phase/project/prompt_version.
- **EvalHarness** — Offline (golden dataset, gate prompt changes) + Online (LLM-as-judge sample on prod sessions).
- **ReplayDebugger** — given event_log + checkpoint, re-runs deterministically.
- **PromptRegistry** — every system prompt versioned by content hash.

---

## 4. Multi-Agent Coordination Protocol

### 4.1 The Four Concurrency Scenarios

| # | Scenario | Mechanism |
|---|---|---|
| A | Different issues, different files | Independent dispatch. No coordination. |
| B | Different issues, overlapping files | **ScopeLease** + conflict queue |
| C | Same issue, different sub-aspects | **Coordinator decomposes** → parallel specialists on sibling branches → integrate |
| D | Same issue, parallel exploration (best-of-N) | Parallelization pattern, rare |

### 4.2 ScopeLease Protocol

**Acquire:**
```
LeaseManager.acquire(session=S, patterns=[...], ttl=600s)
  → Conflict check: any active lease with overlapping glob?
    No conflict → grant; emit Event(lease_acquired); start heartbeat
    Conflict with L held by S':
      S' close to done (>80% by harness signal) → queue S
      S higher priority → revoke L (S' must checkpoint + release)
      Else → block S in wait queue
```

**Heartbeat:** every 30s. Missed 3 → lease expired → revoked.
**Release:** explicit on complete/fail/abort.
**Revocation:** Coordinator can force-revoke; session catches signal, saves state, releases.

### 4.3 Same-Issue Multi-Specialist Flow (Scenario C)

See §4.3 of architecture spec for full walkthrough. Summary:
1. Triager → complexity classification
2. Coordinator → decomposition into N disjoint sub-scopes
3. LeaseManager grants all (scopes verified disjoint)
4. N specialists run in parallel on sibling branches
5. Events bridge specialists (Tester subscribes to Implementer's commit event)
6. Coordinator integrates branches at end
7. Reviewer (Complex only) reviews integrated diff

### 4.4 Event Bus Between Agents

Implementation: PostgreSQL `LISTEN/NOTIFY` on events table inserts. Sessions subscribe to event filters. Coordinator always subscribed to all events for its issue. **No direct agent-to-agent RPC** — all comms via event log (durable, replayable, observable).

### 4.5 Knowledge Sharing

Project Memory read on session start (Context Assembler pulls relevant by scope), written on session complete (`add_knowledge` tool call if learned non-obvious). Supersede chain via `supersedes_id`. Decay via `useCount` + `lastUsedAt`; reaper archives entries unused 90 days.

### 4.6 Memory Architecture (6-tier)  ⭐ **(new)**

Hours-long issues handled by **bounded sessions + memory bridges**. No single session lives >60min; issues span hours via chained sessions.

| Tier | Scope | Storage | Lifespan | Mechanism |
|---|---|---|---|---|
| **1. Working** | Per LLM call | In-context | Per-turn | LLM context window (~160K usable) |
| **2. Compaction** | Per session | In-context (sliding) | Session | Trigger at 80%; summarize older 50%, keep critical decisions |
| **3. Scratch** | Per session | `agent_session.scratch JSONB` | Session lifetime | Tools `scratch_write` / `scratch_read`. Notepad outside context. |
| **4. Checkpoint** | Per session | DB snapshot | Replayable | LangGraph PostgresSaver + custom snapshot every N events. Resume after budget cap / crash. |
| **5. IssueMemory** | Per issue | Materialized view from event log | Issue lifetime | Projected by `IssueMemoryProjector`. 3 parts: Episodic + Semantic + Working. Read on every new session for the issue. |
| **6. ProjectKnowledge** | Per project | KnowledgeEntry table | Forever | Cross-issue learnings. Categories + supersede + usage tracking. |

**Concrete flow — Implementer task 2 hours:**
1. Session 1 starts at T+0. Budget 60min, $3.
2. Context at 80% (T+45) → compaction fires.
3. Budget cap approached (T+58) → BudgetEnforcer triggers `scratch_write` + checkpoint + session end.
4. T+62: continuation session 2 starts. Reads checkpoint + scratch + IssueMemory. Resumes.
5. T+115: completes. IssueMemory updated. Tester session subscribed to completion event, starts.

---

## 5. Data Model (entities + key relationships)

```
Project (1) ──< (N) Issue
Project (1) ──< (N) Workflow
Project (1) ──< (N) KnowledgeEntry
Project (1) ──< (N) AgentDefinition
Project (1) ──< (N) ChatSession
Project (1) ──< (N) Notification
Project (1) ──< (1) PolicyConfig

Issue (1) ──< (N) WorkflowRun
Issue (1) ──< (N) AgentSession
Issue (1) ──< (N) ScopeLease
Issue (1) ──< (N) Event
Issue (1) ──< (N) Comment
Issue (1) ──< (1) IssueMemory  (materialized)
Issue (N) ──< (N) Issue (parent/child)
Issue (N) ──< (N) Issue (blocks/blocked_by)

AgentDefinition (1) ──< (N) AgentSession  (role reference)
AgentDefinition (N) ──< (N) Skill  (capability refs)

WorkflowRun (1) ──< (N) Event
AgentSession (1) ──< (N) Event
AgentSession (1) ──< (1) ScopeLease (current, optional)
AgentSession (1) ──< (1) Workspace (worktree branch)

ChatSession (1) ──< (N) Event  (chat_message events)
ChatSession (1) ──< (N) AgentSession  (suggested issue creates trigger session)

Event (append-only, immutable)
  causation_id → Event (DAG)

Issue fields: ..., ai_confidence (float)
KnowledgeEntry fields: ..., useCount (int), lastUsedAt (timestamp), supersedes_id (FK)
```

**Critical invariant:** `events` table is only written by Execution Plane + ChatHandler. All other tables populated by projectors from events.

**Plugin tables (v1.1):**
```
plugin_registrations (name, version, manifest_jsonb, loaded_at, status, error_message)
```
Plugin-contributed Workflow/AgentDefinition/Skill/Tool rows tagged with `source_plugin` (NULL = core).

---

## 6. Workflow Engine — LangGraph

**Choice:** LangGraph (confidence: medium-high). Fits multi-agent supervisor pattern; HITL interrupts native; Python first-class; in-process (no separate server). Fallback: Temporal if production scale issues emerge.

**Workflow-as-data:**
- Workflow defined as YAML/JSON in `bumblebee/workflows/*.yaml`
- WorkflowEngine reads YAML → constructs LangGraph StateGraph at startup
- Nodes mapped to AgentDefinition types
- Edges mapped to conditional logic (status, complexity, fail/success)

Example workflow node maps to LangGraph node:
```yaml
- id: implement_subtask
  role: implementer              # → AgentDefinition.type
  parallel: true                 # → LangGraph parallel branch
  on_success: aggregate
  on_fail: { classify: true, route_by_failure: true }
  budget: { wall_min: 60, dollars: 3 }
```

**Versioning:** workflow YAML hashed; changes go through eval gate before activation.

---

## 7. Tool Surface — Single-Verb Discipline

~25 atomic tools total. Per-role filtering: no role sees >8.

| Tool | Used by roles |
|---|---|
| `list_issues` | coordinator, triager, assistant |
| `get_issue` | all |
| `create_issue` | coordinator, user (via chat HITL) |
| `update_issue_status` | all |
| `add_comment` | all |
| `acquire_scope_lease` | implementer, tester, integrator |
| `release_scope_lease` | all (auto on done) |
| `add_knowledge` | all |
| `query_knowledge` | all |
| `request_human_approval` | coordinator, reviewer |
| `suggest_issue` | assistant (chat) |
| `suggest_knowledge_entry` | assistant (chat) |
| `scratch_write` / `scratch_read` | implementer, integrator |
| `run_tests` | tester |
| `run_lint` | implementer |
| `git_commit` | implementer |
| `git_diff` | reviewer |
| `read_file` | all |
| `write_file` | implementer, docwriter |
| `search_code` | all |
| `add_notification` | system + coordinator |
| ... | |

---

## 8. Cutover Plan — 9 Phases, ~14 weeks (v1.1 with plugin tasks)

### Phase 0 — Greenfield setup (1.5 weeks)  ⭐ **+0.5w for pypi package skeleton**
- Create new repo `bumblebee` (sibling to current `Bumblebee-cli`)
- Initialize: monorepo structure (`api/`, `cli/`, `web/`, `workflows/`)
- Fresh PG database, fresh schema (no migration from v2)
- LangGraph + FastAPI scaffolding
- CI/CD: GitHub Actions for lint + test gates
- v2 (current `Bumblebee-cli`) continues running independently
- **(v1.1)** Top-level Python package `bumblebee/` (not `api/src/`); pyproject `[project.scripts] bumblebee = "bumblebee.cli:main"`
- **(v1.1)** Reserve pypi name `bumblebee` + npm scope `@bumblebee` (CHECK FIRST)

### Phase 1 — Single-agent E2E (3 weeks)
- Planes 1, 2, 3, 4 minimal:
  - WorkflowEngine (LangGraph + YAML loader)
  - TaskQueue (PG SKIP LOCKED)
  - Harness for Implementer role only
  - Event log + projection to issue view
- Workflow: `simple-fix-flow` (triage → implement → test → done)
- Multi-provider adapter abstraction (claude-cli wired, others stubbed)
- Minimal API for upcoming web phase
- **Acceptance:** one issue runs end-to-end via event log

### Phase 2 — Safety + Observability scaffolding (1.5 weeks)
- BudgetEnforcer (all 3 scopes, defaults in §12)
- LoopDetector
- TraceEmitter (OTel)
- EvalHarness offline (golden dataset of 20 issues; gate workflow changes)
- CostTracker
- KillSwitch
- **Acceptance:** cannot deploy workflow change without passing golden set

### Phase 3 — Multi-issue concurrency + Plugin loader (2 weeks)  ⭐ **+1w for plugin loader + purity audit**
- ScopeLease + LeaseManager + conflict detection (interval-tree on globs)
- Two issues running on different scopes simultaneously
- **(v1.1)** PluginLoader (`services/plugins/loader.py`) — entry_points discovery, ImportError isolation, register-to-DB
- **(v1.1)** `plugin_registrations` table + alembic migration
- **(v1.1)** Module purity audit — verify `services/control/` is workflow-driven, no hardcoded role logic
- **Acceptance:** Scenario A + B working AND a dummy local plugin loads + registers workflow

### Phase 4 — Web MVP + Coordinator (2.5 weeks)  ⭐ **moved up from Phase 7**
- **Web app (Next.js):** issue list, issue detail, agent stream viewer, queue view, scope lease visualizer
- **Coordinator role + multi-specialist orchestration** (Scenario C)
- AgentDefinition entity (template/instance split)
- Issue.ai_confidence field (computed by Triager)
- Branch management + integrator role
- **Acceptance:** Scenario C end-to-end with web UI

### Phase 5 — Failure taxonomy + mitigation (1 week)
- FailureClassifier (rule-based; LLM-as-judge layer optional)
- Per-failure-type mitigation routing
- Web: failure analysis UI

### Phase 6 — Knowledge memory + Skills + AgentDefinition + Plugin reference (2 weeks)  ⭐ **+0.5w for plugin spec + reference**
- KnowledgeEntry CRUD via tools
- Skill entity (first-class capability bundles)
- Memory `useCount` + `lastUsedAt` decay
- Context Assembler reads relevant entries per session
- Supersede mechanics
- IssueMemoryProjector (materialized view from events)
- **(v1.1)** `bumblebee-plugin-example/` reference plugin (1 workflow + 1 agent + 1 skill); proves SDK
- **(v1.1)** Plugin spec doc `docs/plugin-spec.md` (manifest schema + naming + lifecycle)

### Phase 7 — ChatSession + Notifications + Replay UI + pypi pipeline (2.5 weeks)  ⭐ **+0.5w for pypi publishing**
- ChatSession Tier 2: Assistant role with read tools + suggest tools
- HITL confirmation flow (draft → user approve → write)
- Notification entity + UI panel
- ReplayDebugger UI (event log → re-run from checkpoint)
- Web: chat sidebar/dedicated page
- **(v1.1)** `bumblebee` console_scripts wiring (`init`, `db migrate/seed`, `server`, `daemon`, `plugins list/reload`)
- **(v1.1)** GitHub Actions: build wheel + smoke test → TestPyPI → PyPI on git tag

### Phase 8 — Cutover + TestPyPI release (1 week)
- Migrate issue data via export-script (entities only, fresh event log)
- Decommission v2 endpoints (Bumblebee-cli archived; new repo `bumblebee` is primary)
- Cutover announcement
- **(v1.1)** First TestPyPI release; smoke test `pip install bumblebee-ai` in clean venv on Linux + macOS + Windows
- **(v1.1)** Reserve npm scope `@bumblebee` (no actual TS extension in v3.0)

**Total: ~14 weeks** (v1.1 = 13.5 baseline + 0.5 plugin tasks). Single full-time. Adjust for team size.

---

## 9. What We're NOT Building (anti-scope, explicit)

- Vector DB / embeddings (2026 research confirms structured + BM25 default; add only on measured retrieval failure)
- Mobile app (React Native) — forge has it, bb v3.0 doesn't
- Embeddable widget — forge has it, bb v3.0 doesn't
- ChatSession Tier 3 (chat as orchestration control surface) — risk of NL intent misfire
- Multi-tenancy / org features — single-org for v3.0
- Generic "memory" beyond 6-tier defined in §4.6
- Real-time agent-to-agent RPC (all comms via event log)
- Auto-scaling worker pool (manual device registration in v3.0)
- Custom workflow framework — committed to LangGraph
- Knowledge graph / GraphRAG — defer until multi-hop queries appear in production
- Agent memory framework (mem0/Letta/Zep) — defer until measured need (>100K interactions/month)
- **(v1.1)** Plugin marketplace UI, sandboxing, signing — basic entry_points loader only for v3.0
- **(v1.1)** TS CLI extensions (npm) actual implementation — namespace reserved, build Phase 6+
- **(v1.1)** Plugin hot-reload (no restart) — restart via CLI command is fine for v3.0

---

## 10. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| ScopeLease deadlock | Med | High | Acquire order = priority + age; deadlock detection in LeaseManager with revocation |
| Coordinator bottleneck | Med | Med | Coordinator session per-issue, not global |
| Event log table grows unboundedly | High | Low (storage cheap) | Partition by month; cold storage after 6 months |
| FailureClassifier unreliable as LLM-judge | Med | Med | Start rule-based; add LLM layer later if needed |
| **LangGraph production scale unknown** | Med | High | Phase 2 stress-test concurrent workflow runs; fallback Temporal if issues |
| **LangGraph checkpointer overlaps event log** | Med | Med | Use checkpointer for resume, events as canonical truth; clear separation at Plane 4 |
| Eval gate slows iteration | Med | Med | Tier gates: lint (instant) → 5-item smoke (1 min) → full golden (10 min, merge gate) |
| Knowledge entries pollute context | Med | Med | Relevance scoring via useCount + lastUsedAt + scope tag filter |
| Same-issue parallel branches generate merge conflicts | High | Med | Coordinator enforces disjoint sub-scopes; integrator role for non-trivial merges |
| Greenfield rebuild takes 2x estimated time | High | High | Phase 1 must work end-to-end. Cut scope aggressively if Phase 1 slips |
| Industry default values wrong | Med | Low | Phase 2 Observability surfaces saturation; tune via PolicyConfig (no code change) |
| ~~(v1.1) pypi name `bumblebee` taken~~ | ✅ RESOLVED | — | Confirmed taken by abandoned 2011 lib. v3 uses **`bumblebee-ai`**. PEP 541 takeover submitted in parallel. |
| **(v1.1)** Plugin import fails at startup | M | H | ImportError isolation in PluginLoader; log + mark disabled; server continues |
| **(v1.1)** Plugin version dep conflict | M | M | Document compat matrix; pip resolver handles; semver MAJOR for plugin manifest schema |
| **(v1.1)** Daemon wheel breakage on Windows (asyncpg native) | M | H | CI test matrix Linux/macOS/Windows; fallback psycopg if needed |
| **(v1.1)** Plugin namespace collision (2 plugins same workflow name) | M | M | Namespace by plugin: workflow id = `<plugin>:<name>` |

---

## 11. Decisions Locked (resolved during design phase)

| Decision | Choice | Rationale |
|---|---|---|
| Workflow engine | **LangGraph** | Designed for LLM agents; HITL interrupts native; Python first-class; in-process |
| Repo strategy | **New repo `bumblebee`** | Clean slate; sibling to `Bumblebee-cli` (which becomes legacy) |
| Backend stack | **Python (FastAPI + async SQLAlchemy + PG)** | Async queue-heavy workload fit; v2 mental model preserved |
| Surfaces v3.0 | **CLI (Phase 1) + Web (Phase 4) + MCP** | No mobile, no widget |
| ChatSession scope | **Tier 2** (Q&A + suggest via HITL) | Tier 1 too limited; Tier 3 risky NL→orchestration |
| Knowledge retrieval | **Structured + BM25 (no vector)** | 2026 research: Claude Code's agentic search wins; vectors only on measured fail |
| Issue Memory | **6-tier (working/compaction/scratch/checkpoint/IssueMemory/ProjectKnowledge)** | Handles hours-long issues via bounded sessions + memory bridge |
| Branch model | **Per-specialist branch + integrator merge** | Rollback isolation if one specialist fails |
| Provider strategy | **Multi-provider abstraction from Phase 1, claude-cli wired** | Future-proof, no over-engineering |
| Calibration data | **Skip v2 DB queries; use industry defaults** | v2 single-agent ≠ v3 multi-agent; defaults in §12; calibrate from v3 telemetry |
| Forge adoptions | **5 concepts** | AgentDefinition, Skill, Memory useCount/lastUsedAt, Notification, Issue.ai_confidence |
| **(v1.1) Extensibility** | **Plugin-ready via entry_points** | New domain = pypi package, no core change; Approach B from extensible framework brainstorm |
| **(v1.1) Plugin language** | **Python primary (pypi) + TS CLI deferred** | Match stack; npm extensions reserved for Phase 6+ |
| **(v1.1) Distribution** | **Full-stack pypi** (`pip install bumblebee-ai` = server + daemon + CLI) | Web UI separate via npm/Next.js (Phase 4); single install surface for users |

---

## 12. Industry Defaults (starting values; calibrate post-launch)

These are reasonable starting values. Phase 2 Observability surfaces saturation; tune via PolicyConfig JSONB (no code change).

| Setting | Default | Source / Rationale |
|---|---|---|
| Session wall time | 60 min | Claude Code timeout default |
| Session tokens | 160K | 80% of 200K Claude context |
| Session $$ | $3 | ~50K input + 5K output worst case |
| Per-issue $$ ceiling | $10 | Allow ~3-5 sessions worst case |
| Project daily $$ | $200 | Solo/small team usable |
| Compaction trigger | 80% context | Anthropic context engineering guide |
| Eval cadence | Every prompt change + weekly full | Standard CI pattern |
| Retry max | 3 | v2 baseline (proven) |
| Heartbeat | 30s | v2 baseline (proven) |
| Lease TTL | 10 min | Conservative for first run |
| Loop detector window | Last 5 calls same tool+args | Standard pattern |
| Knowledge entry decay | Archive if unused 90 days | Forge pattern |
| Event log retention hot | 6 months | Then cold storage |
| Checkpoint interval | Every 50 events OR before risky op | Balance between resume granularity and write cost |

---

## 13. Open Questions (genuinely unresolved)

Most pre-design questions resolved (see §11). Remaining:

1. **LangGraph checkpointer vs event log boundary** — both store state; clear separation needed at Plane 4. Likely: checkpointer for fast resume, event log for canonical truth + replay. To finalize in Phase 1.
2. **Coordinator decomposition reliability** — how well does LLM decompose Complex issues into truly disjoint scopes? Mitigation if poor: human-edit-decomposition-before-dispatch as default for Complex.
3. **Tier 2 chat trigger ambiguity** — when user chats "create issue for OAuth bug", does Assistant create draft (Tier 2) or directly enqueue Triager (verging Tier 3)? Resolve by: always draft + HITL approve; if user wants speed, they can `/approve_quick`.
4. **Skill primacy vs hardcoded roles** — should role definition live entirely in Skill entity, or split (AgentDefinition + linked Skills)? Phase 6 decision.
5. **Web UI complexity for status enum** — 12+ active statuses cognitively heavy. Group into stages (discovery/planning/execution/verification/shipped) for UI? Phase 4 design call.

---

## 14. Success Criteria (definition of v3.0 done)

- [ ] One issue runs end-to-end on LangGraph workflow + event log
- [ ] Two issues run concurrently on different scopes (Scenario A)
- [ ] Two issues run concurrently on overlapping scopes; lease blocks correctly (Scenario B)
- [ ] One Complex issue decomposed into 3+ specialist sub-tasks running in parallel, integrated automatically (Scenario C)
- [ ] BudgetEnforcer halts a runaway session within 1% of cap
- [ ] LoopDetector breaks an infinite loop within 5 repeated calls
- [ ] FailureClassifier correctly tags 70%+ of fails by category on labeled validation set
- [ ] Golden eval set passes 100% before merge of any prompt/workflow change
- [ ] ReplayDebugger reproduces a chosen past session deterministically
- [ ] ChatSession Tier 2 works end-to-end: user chats → Assistant suggests issue → user approves → issue created
- [ ] Hours-long issue (4h+ wall time) completes via chained bounded sessions with memory bridging
- [ ] Web UI functional from Phase 4: issue list, detail, agent stream, queue
- [ ] Bumblebee-cli (v2) archived; `bumblebee` repo is primary
- [ ] **(v1.1)** `pip install bumblebee-ai` works on Linux + macOS + Windows in clean venv
- [ ] **(v1.1)** `bumblebee init && db migrate && db seed && server` brings up working API
- [ ] **(v1.1)** Reference plugin `bumblebee-plugin-example/` installs + registers 1 workflow + 1 agent + 1 skill; `bumblebee plugins list` shows it
- [ ] **(v1.1)** Plugin load failure isolated — bad plugin doesn't crash server
- [ ] **(v1.1)** Plugin workflow runs end-to-end via same execution path as core workflows
- [ ] **(v1.1)** Module purity — rename a default workflow yaml works without code change

---

## 15. Next Actions

1. **(v1.1) ✅ DONE — pypi name chosen: `bumblebee-ai`** — `pypi/bumblebee` taken by abandoned 2011 html-transform library (Nathan Van Gheem, last release 2011-09-22). Use `bumblebee-ai` for v3.0.
2. **(v1.1) SUBMIT PEP 541 takeover request** for `pypi/bumblebee` — abandoned 15 years, qualifies for reclaim. Process ~4-8 weeks. Continue with `bumblebee-ai`; rename if/when transfer succeeds. Submit at https://github.com/pypi/support/issues/new?template=pep541.yml
3. **(v1.1) RESERVE npm scope `@bumblebee`** — AVAILABLE (verified 2026-05-18). Create org on npm to lock.
3. **Create new repo `bumblebee`** (Phase 0 start)
4. **Scaffold:** top-level Python package `bumblebee/` (not `api/src/`), pyproject with console_scripts, monorepo (api/, cli/, web/, workflows/), LangGraph + FastAPI base, PG schema, CI workflows
5. **Document Phase 0 setup** in `bumblebee/docs/getting-started.md`
6. **Begin Phase 1:** single-agent E2E

Plan.md will move to `bumblebee/plans/v3-rebuild/plan.md` at end of Phase 0; for now stays in current repo for design history.

**Note:** scaffold already done in `D:\Source\bumblebee-v3\` (51 tests passing). Phase 0 task = restructure to top-level `bumblebee/` package + console_scripts (~1-2 days).

---

**Status:** Plan v1.1 LOCKED. v1.0 + plugin-ready + full-stack pypi distribution. Ready for Phase 0 execution.

## Change Log

- **v1.1.1 (2026-05-18, evening)** — Resolved pypi name conflict: `bumblebee` was taken by abandoned 2011 library. Locked **`bumblebee-ai`** as primary distribution name for v3.0. PEP 541 takeover request planned in parallel. npm scope `@bumblebee` verified AVAILABLE; reserve at Phase 0.
- **v1.1 (2026-05-18)** — Added plugin-ready architecture (Approach B from extensible-framework brainstorm): PluginLoader subsystem, `plugin_registrations` table, entry_points discovery, console_scripts wiring, pypi publishing pipeline. Timeline +0.5w → 14 weeks total.
- **v1.0 (2026-05-18)** — Initial design lock: 7-plane architecture, LangGraph commitment, 6-tier memory, ChatSession Tier 2, forge adoptions, 9-phase cutover plan.
