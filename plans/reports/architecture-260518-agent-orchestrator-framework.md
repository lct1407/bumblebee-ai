# Agent Orchestrator Framework — Reference Architecture

**Date:** 2026-05-18
**Scope:** Canonical reference for production-grade agent orchestrator. Derived from `researcher-260517-2010-agent-architecture-standards.md` + `brainstormer-260517-2010-bb-v3-architecture.md`.
**Usage:** Audit existing systems (bb v2) and design new ones (bb v3). NOT code — conceptual blueprint with explicit invariants.

---

## 0. Design Principles (8 Invariants)

Every component obeys these. Violation = redesign.

| # | Principle | Source |
|---|---|---|
| 1 | **Workflow > Agent** — deterministic code path wherever possible; LLM only for irreducible NL/judgment steps | Anthropic [building-effective-agents] |
| 2 | **Harness > Model** — scaffolding (prompts, tools, context budget, hooks) beats LLM upgrades | [addyosmani-harness] |
| 3 | **Context is a budget** — track real-time; target 60-80% utilization; compress before fill | [anthropic-context-engineering] |
| 4 | **Stateless reducer** — agent = `(state, event) → (new_state, output)`; state lives externally | 12-factor #12 |
| 5 | **Unified execution + business state** — single source of truth; no drift between "did it happen" log and app state | 12-factor #5 |
| 6 | **Tools = structured outputs** — strict schemas, examples in defs, <10 per agent, lazy-load above | 12-factor #4 + [advanced-tool-use] |
| 7 | **Failures are design inputs** — every past failure → a rule in the harness now | [microsoft-taxonomy] |
| 8 | **Observe from day one** — traces, evals, cost; you cannot debug what you cannot replay | [observability-guide] |

---

## 1. Reference Architecture (Hero Diagram)

```
                    ┌──────────────────────────────────────────┐
                    │           TRIGGER SURFACE                │
                    │  user · webhook · cron · CLI · API · MCP │
                    └──────────────────┬───────────────────────┘
                                       │
                                       ▼
   ╔═══════════════════════════════════════════════════════════════╗
   ║                    1. CONTROL PLANE                           ║
   ║                                                                ║
   ║   ┌─────────────────┐  ┌────────────┐  ┌──────────────────┐  ║
   ║   │ Workflow Engine │  │  Router    │  │  HITL Gates      │  ║
   ║   │ (decl. graphs)  │→ │ (classify) │→ │  (as tool calls) │  ║
   ║   └─────────────────┘  └────────────┘  └──────────────────┘  ║
   ║              │                                                 ║
   ║              ▼                                                 ║
   ║   ┌──────────────────────────────────────────────────────┐   ║
   ║   │  Decision Log (why this transition fired)            │   ║
   ║   └──────────────────────────────────────────────────────┘   ║
   ╚═══════════════════════════════════╤═══════════════════════════╝
                                       │ enqueue(task)
                                       ▼
   ╔═══════════════════════════════════════════════════════════════╗
   ║                    2. DISPATCH PLANE                          ║
   ║   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   ║
   ║   │ Priority     │  │ Worker Pool  │  │ DLQ + Reaper     │   ║
   ║   │ Queue (atomic│←→│ (devices,    │  │ (stale claim →   │   ║
   ║   │ SKIP LOCKED) │  │  heartbeat)  │  │  re-enqueue)     │   ║
   ║   └──────────────┘  └──────────────┘  └──────────────────┘   ║
   ╚═══════════════════════════════════╤═══════════════════════════╝
                                       │ claim(task) + lease
                                       ▼
   ╔═══════════════════════════════════════════════════════════════╗
   ║                    3. EXECUTION PLANE (Harness)               ║
   ║   ┌─────────────────────────────────────────────────────┐    ║
   ║   │  per-phase harness                                  │    ║
   ║   │   ┌──────────┐  ┌──────────┐  ┌────────────────┐    │    ║
   ║   │   │ Context  │  │ Tool     │  │ LLM Provider   │    │    ║
   ║   │   │ Assembler│→ │ Dispatch │← │ Abstraction    │    │    ║
   ║   │   │ + Budget │  │ + Schema │  │ (claude/gem/…) │    │    ║
   ║   │   └──────────┘  └──────────┘  └────────────────┘    │    ║
   ║   │   ┌──────────────────────────────────────────────┐  │    ║
   ║   │   │ Subagent Spawner (context firewall)          │  │    ║
   ║   │   │  → fresh context, return compressed summary  │  │    ║
   ║   │   └──────────────────────────────────────────────┘  │    ║
   ║   │   ┌──────────────────────────────────────────────┐  │    ║
   ║   │   │ Working Env (worktree / sandbox / VM)        │  │    ║
   ║   │   └──────────────────────────────────────────────┘  │    ║
   ║   └─────────────────────────────────────────────────────┘    ║
   ╚════╤══════════════════╤══════════════════╤══════════════╤════╝
        │ emit events      │ check budget     │ tool call    │ ack
        ▼                  ▼                  ▼              ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────┐
   │ 4. STATE    │  │ 5. SAFETY    │  │ 6. TOOL      │  │ → next │
   │   PLANE     │  │   PLANE      │  │   PLANE      │  │ phase  │
   │             │  │              │  │              │  │ via ▲  │
   │ Event Log   │  │ Circuit      │  │ Tool         │  │ Ctrl   │
   │ (append-    │  │ Breakers     │  │ Registry     │  │ Plane  │
   │  only,      │  │ (session/    │  │ (versioned,  │  └────────┘
   │  canonical) │  │  item/proj)  │  │  strict)     │
   │             │  │              │  │              │
   │ Checkpoints │  │ Loop Detect  │  │ Schema Valid │
   │ (snapshot)  │  │              │  │              │
   │             │  │ Failure      │  │ MCP Server   │
   │ Materialized│  │ Classifier   │  │ + Lazy Disc. │
   │ Views (CQRS)│  │              │  │              │
   │             │  │ Kill Switch  │  │ Provenance   │
   │ Idempotency │  │              │  │ Tags         │
   │ Keys        │  └──────────────┘  └──────────────┘
   └──────┬──────┘
          │
          ▼
   ╔═══════════════════════════════════════════════════════════════╗
   ║                  7. OBSERVABILITY PLANE                       ║
   ║                                                                ║
   ║  ┌─────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────────┐║
   ║  │ Traces  │  │ Cost Tracker │  │ Evals    │  │ Replay      │║
   ║  │ (OTel)  │  │ (per session,│  │ (offline │  │ Debugger    │║
   ║  │         │  │  item, proj) │  │ + online,│  │ (event log  │║
   ║  │ Prompt  │  │              │  │  LLM-as- │  │  → re-run   │║
   ║  │ Versions│  │ Latency      │  │  judge)  │  │  from chkpt)│║
   ║  └─────────┘  └──────────────┘  └──────────┘  └─────────────┘║
   ╚═══════════════════════════════════════════════════════════════╝
```

**Read direction:** trigger → control → dispatch → execution. State/safety/tool/observability planes are **cross-cutting** (every plane writes to them, none owns them).

---

## 2. The 7 Planes — Component Spec

### Plane 1: Control Plane

**Responsibility:** Decide what runs next.

| Component | Purpose | Patterns | Anti-patterns |
|---|---|---|---|
| Workflow Engine | Execute declarative graph (nodes=phases, edges=conditional transitions) | Workflow-as-data (JSON/YAML); Temporal/LangGraph-style | Status field as orchestration logic; hardcoded `if status==X` chains |
| Router | Classify input → pick workflow variant / first phase | Routing (Anthropic pattern #2); complexity classifier | Routing logic embedded in workflow nodes |
| HITL Gates | Human approval as a tool call | 12-factor #7; same mechanism as other tools | Special status `awaiting_human` with custom logic |
| Decision Log | Record every transition: which rule fired, what evaluator decided | Provenance for replay | Decisions made in code without log entry |

**Invariants:**
- Workflow definition is **data**, not code. Loadable, versionable, diff-able.
- One source of truth for "what runs next." If two orchestrators coexist → instant redesign trigger.
- Transitions are **pure functions** of state + event. No side effects in transition logic.

---

### Plane 2: Dispatch Plane

**Responsibility:** Route work to workers reliably.

| Component | Purpose | Patterns | Anti-patterns |
|---|---|---|---|
| Priority Queue | Persistent, atomic claim, priority levels | PostgreSQL `SELECT … FOR UPDATE SKIP LOCKED`, Redis Streams, SQS | Push-based without ack; in-memory queue |
| Worker Pool | Devices/agents with capabilities + heartbeat + max concurrency | Lease-based claim; capability-based routing | Static worker assignment |
| DLQ | After N retries → dead letter for manual triage | Retry with exp backoff + jitter; max attempts cap | Infinite retry; silent drops |
| Queue Reaper | Background: stale claims (no heartbeat for T) → re-enqueue | Lease expiry | Lost work when worker crashes |

**Invariants:**
- Claim is **atomic** (no double-execution under any race condition).
- Every claim has a **lease** with heartbeat. No heartbeat in T seconds → claim invalidated.
- Retries are **idempotent**. Side effects gated by idempotency keys.

---

### Plane 3: Execution Plane (the Harness)

**Responsibility:** Execute one phase against an LLM, safely.

| Component | Purpose | Patterns | Anti-patterns |
|---|---|---|---|
| Context Assembler | Build the LLM prompt: system + tools + history + retrieved + user input | Context as budget; just-in-time retrieval; compaction | Stuff everything; framework auto-injection |
| Tool Dispatcher | Validate tool calls, execute, return structured results | Strict schema; example-driven; programmatic orchestration | Loose schemas; LLM-side parsing |
| LLM Provider Abstraction | Swap claude-cli ↔ gemini-cli ↔ OpenAI without changing harness | Adapter pattern | Hardcoded provider; per-provider business logic |
| Subagent Spawner | Spin specialist with fresh context, return summary only | Context firewall; supervisor-worker | Pass full parent context to child |
| Working Env | Filesystem sandbox (worktree, container, VM) | Isolation; cleanup on done | Shared workspace across phases |

**Invariants:**
- Each phase = **stateless reducer**: given canonical state, produces deterministic output (modulo LLM stochasticity).
- Context window is **measured before each LLM call**. Compaction triggers at 80%. Hard cap at 95% (escalate).
- Tool result entering context is **compacted**: only relevant fields, not raw API response.
- Subagent results enter parent context as **summary**, never raw transcript.

---

### Plane 4: State Plane

**Responsibility:** Canonical truth of what happened. Replayable.

| Component | Purpose | Patterns | Anti-patterns |
|---|---|---|---|
| Event Log | Append-only stream of every meaningful event: LLM input, output, tool call, tool result, decision, status change | Event sourcing; immutable | Mutable state rows as truth; events derived from rows |
| Checkpoints | Snapshot state every N events for fast restore | Replay from checkpoint, not from event 0 | Replay from beginning every time |
| Materialized Views | Read-optimized denormalized rows for UI/queries (issues, sessions, comments) | CQRS | Reading from event log for UI |
| Idempotency Keys | Every side effect tagged with unique key, dedup-able | Safe retries | Retry causes duplicate side effects |

**Invariants:**
- Event log is **append-only** and **canonical**. If event log says X happened, X happened.
- Views are **rebuildable** from event log. If a view is corrupted, drop and reproject.
- **Execution state and business state are unified.** No "did the agent actually do this?" ambiguity. (12-factor #5)
- Every cross-system effect (commit, deploy, API call) has an idempotency key.

---

### Plane 5: Safety Plane

**Responsibility:** Prevent runaway. Fail closed.

| Component | Purpose | Patterns | Anti-patterns |
|---|---|---|---|
| Circuit Breakers | Hard limits per scope: tokens, wall-time, cost | **Per session**, **per item**, **per project** — all three | Single global cap; cap at wrong granularity (e.g. project-per-day) |
| Loop Detector | Same tool + same args in last N calls → break, escalate | Pattern matching; LLM doesn't self-detect loops | Trust LLM to break its own loop |
| Failure Classifier | After fail: classify cause (hallucination / tool err / context exhaust / goal drift / infra / planning) → route mitigation | LLM-as-judge; taxonomy-driven retry | Blanket `reimplement` for any failure |
| Goal Re-anchor Hooks | Every M turns or before major decision, restate primary goal | Role-pinning; system prompt reinjection | Letting role drift accumulate |
| Kill Switch | Operator can halt any session immediately | Signal handling; cleanup hooks | Sessions you can't stop |

**Invariants:**
- **All three scopes** (session, item, project) have hard ceilings. Hitting any ceiling = stop, don't slow down.
- Loop detection is **structural** (in code), not promised by the LLM.
- Every `failed` status carries a **failure_reason** enum, not just a flag.
- Kill switch works in <5 seconds. Worker must respond to it.

---

### Plane 6: Tool Plane

**Responsibility:** Capability surface for agents.

| Component | Purpose | Patterns | Anti-patterns |
|---|---|---|---|
| Tool Registry | Versioned tool defs with strict schemas + examples | <10 tools per agent baseline; lazy-load above | 50 tools; multi-verb tools dispatching on `action=` string |
| Schema Validator | Reject malformed tool calls before execution | `strict: true` in API; reject + retry with hint | LLM-side validation; silent acceptance |
| MCP Server | Expose tools to external consumers (Claude Code, other agents) | Lazy discovery; standard protocol | Tools also baked into prompt by hand |
| Tool Search | When count > threshold, agent searches for relevant tools first | Tool search (Anthropic advanced tool use) | All tools always in context |
| Provenance Tags | Every tool result labeled: `verified_fact | inference | user_input | hallucination_risk` | Track epistemic status | Treat all tool output as ground truth |

**Invariants:**
- Tool descriptions are **non-overlapping**. Test: can a competent human pick the right tool from descriptions alone?
- Every tool has **at least one example** in its def. (72% → 90% accuracy gain documented.)
- Tools fail with **structured errors**, not exceptions. Errors compact-able into context.

---

### Plane 7: Observability Plane

**Responsibility:** See, measure, replay.

| Component | Purpose | Patterns | Anti-patterns |
|---|---|---|---|
| Traces | Every LLM call + tool call with parent span; OpenTelemetry-compatible | Distributed tracing; prompt version captured | Debugging by reading WS stream after the fact |
| Cost Tracker | Token + dollar attribution per session, item, phase, project, prompt version | Real-time; alerts on threshold | Costs known only at end-of-month billing |
| Latency Tracker | Per phase, per tool, per provider | SLO-driven | Latency is a vibe |
| Eval Harness | Offline (regression on fixed dataset) + online (LLM-as-judge on prod sample) | Three-layer: model / agent / system | One eval at deploy; nothing afterward |
| Replay Debugger | Given event log + checkpoint, re-run identically | Deterministic restore | "It failed somewhere yesterday, no idea where" |
| Prompt Version Registry | Hash of every prompt template in use; tied to traces | Diff prompts across versions | Edit prompts in place without version |

**Invariants:**
- **No untraced LLM calls.** Every call is logged with prompt hash, model, tokens, latency, cost.
- **Replay must produce same trace** given same inputs + same prompt version (modulo provider stochasticity, which is also captured).
- Every production failure becomes a **regression test case**. Eval suite grows monotonically.

---

## 3. Data Flow Walkthrough — Single Issue Lifecycle

```
[1] CREATE
    User submits issue → Trigger Surface → Control Plane
    Workflow Engine selects workflow (e.g. "code-fix-flow")
    Router classifies complexity (Simple/Medium/Complex)
    First phase = "triage"
    Decision Log: "selected code-fix-flow, complexity=Simple, phase=triage"

[2] DISPATCH
    Control Plane → enqueue(task: { item_id, phase: triage, provider: claude-cli, priority: 2 })
    Queue stores task with idempotency_key = hash(item_id, phase, attempt)

[3] CLAIM
    Worker pool listens (WS or poll)
    Worker dequeues atomically (SKIP LOCKED) → acquires lease (60s)
    Heartbeat every 30s extends lease

[4] HARNESS BOOT
    Worker spawns harness for phase=triage
    Context Assembler:
      - system prompt (versioned: triage-v3)
      - tool defs (4 tools for triage: classify, enrich, set_priority, request_info)
      - item data (title, description, recent comments)
      - session_context summary (if continuing)
    Budget check: estimated_tokens / max_tokens < 0.8 → OK

[5] EXECUTE
    LLM call → tool call: classify(complexity=Simple)
    Tool Dispatcher validates schema → executes → result back
    Loop until "done" or budget threshold
    Every step:
      - State Plane: append event(phase=triage, event_type=llm_call, prompt_hash, tokens_in, tokens_out)
      - Safety Plane: check session/item/project budgets, loop detector, goal anchor
      - Observability: emit trace span

[6] COMPLETE
    Harness returns result: { status: success, output: {complexity, priority, enriched_description} }
    Worker → State Plane: append event(phase=triage, event_type=completed, result)
    Worker → Queue: ack(task)
    Materialized view "issue" updated: status=triaged, complexity=Simple

[7] NEXT TRANSITION
    Status change event → Control Plane
    Workflow Engine evaluates: status=triaged + complexity=Simple → next=analyze (auto)
    Loop to step [2]

[8] FAIL PATH (if step 5 errors)
    Harness catches → Failure Classifier (LLM-as-judge): "context_exhaustion"
    Safety Plane routes: context_exhaustion → split task into subagents
    OR if max_retries exceeded → DLQ → human escalation tool call

[9] OBSERVE (continuous, async)
    Trace collector flushes to OTel backend
    Cost Tracker updates per-session running total
    Online eval samples 10% of completed phases, scores against rubric
    Alert if success_rate drops below threshold over 1h window

[10] REPLAY (on demand)
    Operator: "replay session X from checkpoint Y"
    Restore state from checkpoint Y → replay events Y→current with same prompts → diff outputs
```

**Key property:** any step can be inspected in isolation. Every event is reproducible.

---

## 4. bb v2 → Reference Mapping

| Plane | bb v2 State | Gap vs Reference | Priority |
|---|---|---|---|
| **Control** | Status-driven `on_status_change()` + workflow engine (v2) coexist as **two orchestrators** | Sunset legacy `pipeline_orchestrator.py`; promote workflow engine to single source | **HIGH** — biggest unaddressed debt |
| **Dispatch** | PG SKIP LOCKED + device pool + DLQ + heartbeat + reaper | Already strong. Minor: provider routing matrix could be config-driven | LOW |
| **Execution** | Spawns `bb agent <phase>` subprocess in worktree; relies on Claude Code's internal harness | No bb-owned harness layer. Context budgeting deferred to Claude. No bb-side subagent isolation. | **MED** — works today but blind |
| **State** | DB rows + `agent_stream_log` + `SessionCheckpoint` (half-built event log) | Event log not canonical. WS stream is parallel truth. Materialized views & event log don't share lineage. | **MED** — foundation half there |
| **Safety** | Retry limit 3, timeout 45min, budget warning at project-per-day | Budget at wrong granularity (need per-session + per-item ceilings). No loop detector. `failed` has no taxonomy. | **HIGH** — runaway risk |
| **Tool** | MCP server: 16 multi-verb tools (action=list/get/create/update) | Over <10 baseline; multi-verb dispatching = tool ambiguity. Tool defs likely lack examples. | **MED** — quality of life + accuracy |
| **Observability** | WS broadcasts + `agent_stream_log` | No structured traces, no eval suite, no replay debugger, cost not granular. | **HIGH** — flying blind on quality |

**Top-3 fixes (already validated by brainstormer):**
1. **Eval suite as deployment gate** — pick 20 representative items as golden set; regression test each prompt change. Cost: 1-2 days.
2. **Per-session + per-item cost ceilings** — hard cutoff, not warning. Cost: <1 day.
3. **Sunset legacy orchestrator** — every change goes to workflow engine only. Cost: 3-5 days but stops doubling all future work.

---

## 5. Anti-Patterns — Things NOT to Build

Each anti-pattern below sounds good in design review. They aren't.

| Anti-pattern | Why it sounds good | Why it isn't | Do instead |
|---|---|---|---|
| Custom workflow framework | "Our workflows are special" | All workflows are similar at the engine layer; framework cost dwarfs domain value | Use existing (Temporal, LangGraph, Inngest) or keep your v2 workflow-as-data |
| Full event-sourcing migration upfront | "Pure architecture" | Migrating 15 entities to event-sourced is months; you don't need all of them in event log | Event-log the **agent execution layer**; keep CRUD for business entities. Hybrid is fine |
| Vector DB for "agent memory" | "Long-term memory!" | For dev task systems, structured DB + JSONB beats vector retrieval at 1/10th complexity | Add vector only if you have measured retrieval accuracy problem |
| 50 tools "for flexibility" | "More capabilities = more useful" | Tool ambiguity tanks accuracy faster than missing tools | Start at 5-10. Add only when measured to help. Use tool-search if >15 |
| Multi-agent everywhere | "Agents collaborate!" | Sync polling between agents = expensive deferred function call with hallucination risk added | Single agent until single-agent fails; then orchestrator-workers, not free-form swarm |
| Replace status enum with state machine library | "More principled" | Status enum + centralized workflow engine = state machine, with familiarity | Keep status enum. Centralize transition logic in workflow engine. Done |
| Build own observability stack | "Tailored to agents" | OTel exists, Langfuse/Braintrust exist | Use them. Custom traces are debt |
| Two orchestrators "during migration" | "Migrate gradually" | Every fix doubles. Migration never completes. | Pick one. Sunset other in same PR. Migration debt > rewrite debt |

---

## 6. Maturity Levels (Self-Audit Rubric)

Rate each plane 0-3. Total = orchestrator maturity score.

| Score | Definition |
|---|---|
| 0 | Component absent or accidental |
| 1 | Exists but ad-hoc; works for happy path only |
| 2 | Designed, instrumented, survives failure modes |
| 3 | Replayable, evaluatable, evolvable independently |

| Plane | bb v2 Score (my estimate) | Target for v3 |
|---|---|---|
| Control | 1 (two orchestrators, status-coupled) | 2-3 |
| Dispatch | 2-3 (already solid) | 3 |
| Execution | 1 (no bb-owned harness) | 2 |
| State | 1 (half-built event log unused) | 2 |
| Safety | 1 (cap at wrong granularity, no taxonomy) | 2-3 |
| Tool | 1-2 (over count, multi-verb) | 2 |
| Observability | 0-1 (no traces, no evals) | 2 |
| **Total** | **7-12 / 21** | **15-18 / 21** |

**Reading:** bb v2 is at **~33-57% maturity**. Most fixes are *consolidation* (sunset duplicates, raise granularity), not new construction. Highest-leverage moves: Safety + Observability + Control consolidation.

---

## 7. Unresolved Questions (need data before deciding)

These need to be answered with DB queries before scoping v3 work. Doing them blind = over- or under-investing.

1. **Failure distribution** — of past `failed` items, what proportion are: tool error / context exhaust / hallucination / infra / goal drift? Determines whether failure classifier ROI is high.
2. **Prompt-change cadence** — how often have phase prompts changed in last 90 days? Determines eval suite urgency.
3. **v2 workflow engine actual usage** — what % of items run through `workflow/executor.py` vs legacy `pipeline_orchestrator.py`? Determines sunset risk.
4. **Session duration p95** — long sessions = bigger context/budget risk.
5. **`session_context` JSONB size distribution** — is bloat real or theoretical?
6. **Cost per item p50/p95** — sets baseline for per-item ceiling.

---

## 8. Sources (cite back to standards)

- `plans/reports/researcher-260517-2010-agent-architecture-standards.md` — full standards research (Anthropic, 12-factor, harness, context engineering, failure modes)
- `plans/reports/brainstormer-260517-2010-bb-v3-architecture.md` — bb-specific audit + top-5 ranked + 10 NOT-to-do
- [anthropic] https://www.anthropic.com/research/building-effective-agents
- [humanlayer-12-factor] https://github.com/humanlayer/12-factor-agents
- [anthropic-context-engineering] https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- [addyosmani-harness] https://addyosmani.com/blog/agent-harness-engineering/
- [microsoft-taxonomy] https://cdn-dynmedia-1.microsoft.com/.../Taxonomy-of-Failure-Mode-in-Agentic-AI-Systems-Whitepaper.pdf

---

**Status:** DONE
**Summary:** Reference architecture for production agent orchestrator in 7 planes with explicit invariants, anti-patterns, and bb v2 mapping with maturity scores per plane.
