# Bumblebee v3 — Agent Architecture Brainstorm

**Date:** 2026-05-17
**Author:** brainstormer (CTO-level advisor mode)
**Reference:** `plans/reports/researcher-260517-2010-agent-architecture-standards.md` (cited inline as `[std §N]`)
**Source-of-truth audit:** code-walked `api/src/workflow/`, `api/src/agents/`, `api/src/services/pipeline_*`, `api/src/mcp/server.py`, `api/src/services/session_checkpoint_service.py`
**Goal:** decide what to change in v3, what NOT to change, surface trade-offs you didn't ask about.

> **Brutal-honesty mandate engaged.** No agree-to-please. Where the user's gap analysis is overstated, I say so. Where they missed something obvious, I add it. Confidence levels per recommendation. Verdicts are mine, not echoes.

---

## 0. Setup notes (read first)

- Audit happened in this session: v2 has a real workflow engine (`api/src/workflow/`) with `WorkflowExecutor`, `TriggerRouter`, `RunStore` port, `WorkflowRunState`. This is **not just rebranded `pipeline_orchestrator.py`** — it's a different beast, partially live behind `/api/v2/*`. The user's framing of "pipeline_orchestrator + v2 workflow-as-data" treats them as if they coexist as design. They don't really — they're parallel paths and the cutover hasn't happened. That alone is the elephant in the room.
- 16 MCP tools registered (`@mcp.tool()` count in `api/src/mcp/server.py`). Standard says <10 [std §5]. Each is multi-action — the count is artificially low if you treat `bumblebee_work_items(action=update)` as one "tool" but actually exposes 4 verbs.
- Budget enforcement exists per-project per-day (`api/src/agents/budget.py`) but **per-session and per-item** caps are absent. The user undercounted the gap here.
- `SessionCheckpoint` model exists with `context_summary` + `files_modified`. So replay-from-checkpoint scaffolding is partially there. The user said "Unclear if canonical event log persists" — half right: checkpoints exist, raw event log does not.
- No `eval/` directory. No regression suite for prompts. Confirmed.
- No failure taxonomy in any model — `failed` is one bit. Confirmed.

These corrections matter for what's "broken vs suboptimal" below.

---

## 1. Honest Critique of v2 Current State

### 1a. What v2 already does right (credit where due)

| Capability | Why it counts | Standard satisfied |
|---|---|---|
| Workflow-as-data (JSON definitions, executor walks node graph) | Workflows are first-class, mutable without redeploy | [std §1] workflow vs agent distinction |
| `SessionCheckpoint` with `context_summary` + `files_modified` | Replay/resume scaffold exists | [std §4] replay & determinism |
| Per-project daily budget cap + WS warning | Cost circuit breaker at one scale | [std §4] cost & latency |
| PostgreSQL SKIP LOCKED queue + dead letter | Real queue semantics, not in-process hack | [std §4] retries & DLQ |
| Heartbeat (30s) + stale-session scanner (120s) + offline checker (60s) | Liveness + orphan detection is wired | [std §4] reliability |
| Status → phase mapping codified, with toggles | State machine is explicit, observable | [std §9] state machine clarity |
| MCP exposes structured CRUD, not just chat | Tools are tools, not "the LLM does API calls" | [std §1] natural-lang → tool calls |
| Tauri daemon + CLI daemon both implement same protocol | Workers are pluggable; not coupled to one client | [12-factor §11] trigger from anywhere |
| Worktree-per-item isolation | Filesystem-level isolation prevents cross-contamination | strong primitive for [std §5] subagent isolation |
| Complexity-based routing (Simple/Med auto, Complex human gate) | Tiered HITL — not all-or-nothing | [std §4] HITL gates |

**Don't let me hear "we're behind on standards." On 10 of the checklist's ~25 line items, v2 has a credible implementation.** The gap is concentrated, not diffuse.

### 1b. Actually broken vs merely suboptimal

| Item | Bucket | Notes |
|---|---|---|
| Two orchestrators coexist (`pipeline_orchestrator.py` legacy + `workflow/executor.py` v2) | **BROKEN** | Two sources of truth for "what phase runs next." Every bug fix has to be applied twice. Cutover plan is referenced but not done. |
| 16 MCP tools, each multi-verb, descriptions overlap (`bumblebee_work_items` vs `bumblebee_comments` both accept JSON `data` blobs) | **BROKEN** at standard level | Standard explicitly: <10 tools, clear descriptions, examples in defs [std §3] [std §9]. We have none of these properties. Symptom: agents will pick wrong tool or invent calls. |
| No eval suite | **BROKEN** | A prompt change to `triage` or `analyze` ships with zero regression guard. This is the highest-risk item in v2. |
| `failed` is monolithic, no taxonomy | **BROKEN** | Can't write targeted mitigations without knowing whether failure was hallucination, tool error, infra, or goal drift. Auto-reimplement blindly on any failure burns money. |
| Per-session / per-item cost cap missing | **BROKEN** | A single runaway session can chew through the daily project cap before the WS warning loop triggers a halt. Cap exists at wrong granularity. |
| Context for `continue` phase reads previous comments naively | **Suboptimal** (becomes broken at scale) | 50+ comments → context bloat. But N comments today: likely <10. So broken at scale, not today. |
| Raw WS stream not canonical event log | **Suboptimal** | Have checkpoints. Lacking is event-sourced log for replay. Half the value already exists. |
| v2 "Lead/specialist A2A" is sync polling | **Suboptimal** | `a2a.py` is sync delegate via DB polling every 2s. Works, but is not orchestrator-workers in the parallelization sense — it's just a glorified function call. Misnomer in marketing. |
| Streaming via WS → multiple UI subscribers | **Fine** | Honest praise. The fan-out is clean. |
| Worktree-per-item | **Fine** | Good isolation primitive. Don't break it. |

### 1c. Your 8 gap-analysis points: scored

| # | Your point | My score | Why |
|---|---|---|---|
| 1 | Context engineering / no token budget per phase | **Correct, slightly overstated** | Context bloat will hit you, but `continue` reading 50 comments is hypothetical at current usage. Real bloat risk is **transcripts injected into next phase via `session_context` JSONB** — that field has no size limit. Re-aim the concern there. |
| 2 | Evaluator-optimizer weak | **Correct, under-stated** | You said "no plan-quality evaluator before execute." True. But also: there's no eval rubric *anywhere*. The test phase compares "tests pass" vs "tests fail" — that's a build signal, not an eval. Confidence drift on planning quality is silent. |
| 3 | Failure observability monolithic | **Correct, high priority** | Promote this. Blanket reimplement on any failure is the #1 cost-runaway vector. |
| 4 | No hard per-session cost cap | **Correct, high priority** | Promote this. Daily project cap is the wrong granularity for a runaway loop in one session. |
| 5 | No eval suite | **Correct, highest priority** | Promote this above all the others. Everything else is mitigated by humans noticing; eval drift is invisible. |
| 6 | Multi-agent "A2A" may be sequential in disguise | **Correct** | Audited `agents/a2a.py` — sync polling. It's a deferred function call, not orchestrator-workers. Call it what it is. |
| 7 | No canonical event log | **Partially wrong** | `SessionCheckpoint` + `agent_stream_log.py` (audited) provide partial event log. Gap is **uniformity** — events live in 3 places (WS stream, checkpoint table, stream log). Re-aim: unification, not absence. |
| 8 | Tool surface too broad / overlapping | **Correct** | 16 tools confirmed. Each multi-verb. Descriptions are functional but lack examples and have overlapping shapes. This is the cheapest fix on the list. |

**Net:** your gap analysis is largely correct. Re-prioritize: **#5 (evals) > #3 (failure taxonomy) > #4 (cost cap) > #8 (tools)** are the high-impact fixes. #1, #2, #6, #7 are real but lower urgency or already partly addressed.

---

## 2. Top 5 Highest-Impact Changes (Ranked)

### #1 — Eval suite as deployment gate

**What:** Build offline eval harness with golden traces for each agent phase (`triage`, `analyze`, `implement`, `review`, `test`, `fix`). Each phase gets ~20–50 frozen scenarios with expected outputs. LLM-as-judge with rubric for soft outputs (plan quality, review thoroughness). Block prompt changes that regress >5% pass rate.

**Why:** [std §4 evals], [std §9 deploy gate]. Without this, every prompt edit is a yolo deploy. Prompt drift is the silent-killer failure mode and we have zero visibility.

**Trade-off:**
- Dev cost: 2–3 weeks initial, ongoing maintenance (~10% of prompt-eng time).
- Runtime cost: ~$50–200 per full eval run (50 scenarios × 6 phases × ~$0.30/eval). Run on PR.
- Complexity: a new subsystem (eval runner, dataset, judge prompts, CI hook).

**Counter-argument:** "We do not have a prompt-change problem yet — we are still adding capabilities, not tuning." True today. False in 3 months when someone optimizes the `triage` prompt and silently halves analyze quality.

**Verdict:** **YES, high confidence.** Single highest-leverage investment. What would change my mind: if you commit to never editing prompts after v3 release (you will not).

---

### #2 — Per-session and per-item hard cost ceilings + circuit breaker

**What:** Three caps, enforced in `RealAgentExecutor` before each LLM call (or each tool call that triggers one):
1. Per-session ceiling (e.g., $5 default, configurable per project)
2. Per-work-item rolling ceiling across all sessions (e.g., $20)
3. Per-loop-cycle (reimplement/fix loops): max N retries × estimated cost

On breach: hard-stop session, mark `cost_exceeded`, route to DLQ for human review.

**Why:** [std §4 cost & latency, retries & DLQ], [std §8 infinite loops]. Current `cost:budget_warning` is observational — nothing stops the runaway. A single agent loop with bad tool output can spike $50+ in 10 minutes. The project-day cap is *averaging* across all items; a single bad item drains everyone budget.

**Trade-off:**
- Dev cost: 1–2 weeks (cost tracking already exists, just enforce).
- Runtime cost: marginal (cost check is cheap).
- Risk: false-positive stops on legitimate complex items → user frustration. Mitigate with override + escalation tool.

**Counter-argument:** "Daily project cap is sufficient — runaway gets caught at $X/day." Wrong. By the time daily cap triggers, the runaway has already spent the money. You want to detect at $5, not at the hourly aggregate cross-over.

**Verdict:** **YES, high confidence.** Cheapest insurance against catastrophic spend. What would change my mind: if daily caps were granular to 1-hour windows AND we had per-session telemetry alerting — but we do not.

---

### #3 — Failure taxonomy with phase-aware mitigation routing

**What:** Replace single `failed` status with `failed_reason` field taking enum:
- `tool_error` (real failure: tool returned 500, exit code != 0)
- `assertion_failed` (test phase explicit fail)
- `hallucination_suspected` (heuristic: cited file/function does not exist, fabricated tool call)
- `goal_drift` (heuristic: final output does not reference original goal)
- `context_exhausted` (token limit hit)
- `infinite_loop` (same tool + args 3+ times)
- `infra_error` (worktree corrupt, git error, network)
- `cost_capped` (hit ceiling from #2)
- `human_rejected` (review or HITL gate said no)
- `timeout` (45-min cap)
- `unknown` (catch-all, manual triage)

Each reason maps to a different mitigation: `tool_error` → retry with backoff; `hallucination_suspected` → re-prompt with stricter system message + reduce model freedom; `goal_drift` → re-anchor goal + fresh subagent; `context_exhausted` → compact and retry; `infra_error` → fix infra, retry; `cost_capped` → human only; `human_rejected` → fix loop with reviewer notes.

**Why:** [std §8 failure taxonomy]. Standard explicitly says generic retries do not work — different failures need different mitigations. Current `auto_reimplement` is the generic retry that the standard warns against.

**Trade-off:**
- Dev cost: 2–3 weeks (detection heuristics for hallucination + drift are the hard parts).
- Runtime: heuristics add 50–200ms per session-end.
- Risk: bad heuristic mis-classifies → wrong mitigation → bigger problem. Start conservative (only `tool_error`, `assertion_failed`, `cost_capped`, `timeout`, `infra_error`, `human_rejected` from observable signals; defer hallucination/drift detection until you have eval baseline from #1).

**Counter-argument:** "Just keep monolithic failure + log details — humans triage." Sort of valid for low-volume. Burns money fast at scale because auto-reimplement keeps firing.

**Verdict:** **YES, medium confidence.** Conservative version (observable failures only) is high-confidence. Hallucination/drift detection is medium because heuristics are tricky. What would change my mind: if reimplement loop has hard cap of 1 (not 3) and DLQ-by-default, the cost case for fine-grained taxonomy weakens.

---

### #4 — MCP tool consolidation + examples in descriptions

**What:** Reduce 16 multi-verb MCP tools to ~8 single-purpose tools. Each tool: one verb, one shape, examples in description, strict schema. Pattern shift from `bumblebee_work_items(action="update", data="{...}")` (multi-verb dispatch) to `bumblebee_update_work_item(id, status, assignee, ...)` (typed args).

**Why:** [std §3 tool use, std §5 harness §6, std §9 tool design]. Anthropic data: examples in defs raises accuracy 72% → 90%. Strict schemas → 100% valid JSON. Current shape is "stuff JSON into `data` field" which the model has to construct correctly without any schema enforcement.

**Trade-off:**
- Dev cost: 1 week.
- Breaking change for any existing MCP clients (Claude Code skill files, anyone else).
- Slight increase in tool count if you fully de-multiplex (could go from 16 multi-verb → 25 single-verb). Standard says count matters less than clarity; lazy-load via tool search if >15.

**Counter-argument:** "Multi-verb is DRY — one tool covers list/get/create/update." DRY at the cost of model confusion. Standard explicitly: "Tool descriptions are crystal clear. Non-overlapping names." `bumblebee_work_items` does 4 things; the model has to disambiguate at every call. Cheap to fix.

**Verdict:** **YES, medium-high confidence.** Cheapest high-quality fix. What would change my mind: empirical eval (from #1) showing current tools score 95%+ on selection accuracy — but I would bet they do not.

---

### #5 — Unify on workflow engine; sunset `pipeline_orchestrator.py`

**What:** Pick one orchestrator. v2 workflow engine is more capable and is the future-state architecture. Sunset legacy `pipeline_orchestrator.py`. Migrate the status→phase mapping into a default workflow definition shipped with each project. Status-change events become trigger nodes [verified: `workflow/triggers.py:on_status_change` already exists].

**Why:** Two orchestrators = two bug surfaces, two mental models, two test paths. Every new feature has to be implemented twice or break parity. [std §5 harness — single source of truth for control flow].

**Trade-off:**
- Dev cost: 3–4 weeks (cutover, regression tests, dual-write period).
- Risk: workflow engine has loop guards but less battle-testing than `pipeline_orchestrator.py`. You are trading proven for cleaner.
- Migration cost: existing projects need workflow definitions backfilled.

**Counter-argument:** "Keep both, pick per-project." This is what is happening today. It is the worst of both worlds. The "we will cut over later" line in CLAUDE.md has been there for at least the last commit cycle (`v2.0-rc1`).

**Verdict:** **YES, medium confidence.** Strategically right, tactically expensive. The expense is unavoidable — every month of delay compounds. What would change my mind: if v2 workflow engine has hidden gaps (audit `loops.py`, `executor.py` failure paths before committing).

---

### Honorable mentions (not top 5)

- **Context budget per phase + summarization of `session_context` JSONB** — your gap #1. Real concern, but currently below the line. Address after #1–#5.
- **Event-sourced log unification** — your gap #7. Half the value already exists in checkpoints. Lower priority until you actually need replay debugging at volume.
- **Subagent isolation for `analyze` and `review`** — Standard recommends [std §6 context firewall]. Cheap to add as workflow primitive once #5 lands. Defer.

---

## 3. Architectural Decisions to Debate

### Decision A — Status-driven pipeline vs declarative workflow graphs

**Status quo:** Status field on `WorkItem` is the source of truth for "where in the pipeline." Phase fires on status transition. v2 workflow engine wraps this in a graph but the trigger nodes are still status-change-based.

**Case for keeping status-driven:**
- Status is human-readable, visible in UI, queryable.
- Existing tooling (boards, filters, reports) keys off status.
- Status transitions are well-understood by humans.

**Case for declarative graphs (Temporal/LangGraph-style):**
- Status is presentation; actual flow can be arbitrary DAG.
- Branches, parallelism, retries are first-class graph constructs, not encoded as status enum.
- Status enum keeps growing (currently 14+ states) — graph nodes can be unbounded without enum churn.

**My take:** Keep status as observable, but make the graph the source of truth. Status becomes a derived projection from current workflow node. v2 workflow engine should be doing this but is not fully — context-stored item_status is currently driven by the work item, not the graph.

**Recommendation:** Hybrid. Workflow graph is authoritative for control flow; status is a denormalized projection emitted by node transitions for human UX. Confidence: medium.

**What would flip me:** If graphs become so complex no one can read them, status enum was actually the better abstraction.

---

### Decision B — Single canonical event log (event-sourcing) vs current dual state

**Status quo:** WS stream is volatile (no persist guaranteed). SessionCheckpoint persists summaries. agent_stream_log persists raw events. Status changes write to work_item_events. Four event streams, none of which is the canonical truth.

**Case for event-sourcing (one log to rule them all):**
- Replay-from-checkpoint becomes trivial.
- Audit trail is automatic.
- WS subscribers, DB rows, checkpoints all become projections.
- [std §5 unify execution + business state] satisfied.

**Case against:**
- Big migration; touches every write path.
- Event-sourced systems are notoriously hard to schema-evolve.
- Storage cost ~3–5x current.
- You do not have a debug-blocker-no-log problem TODAY.

**My take:** Do not do full event sourcing. Do partial. Add an agent_events append-only table that stores (session_id, sequence, event_type, payload_json, ts). All four current streams write to it. Projections rebuild from it. Do not kill existing tables yet. Lower risk, captures 80 percent of benefit.

**Recommendation:** Partial event log, not full event sourcing. Confidence: medium-high.

**What would flip me:** If you build the replay debugger UI from item 1 of standards and find partial log cannot answer the questions — escalate to full event sourcing in v3.1.

---

### Decision C — Subagent isolation vs current monolithic worktree session

**Status quo:** One worktree per work item. Each phase reuses the same worktree. Phase prompt loads previous phase context via session_context JSONB. One Claude CLI process per phase, but its context window is shared with everything previously dumped into the session context.

**Case for fresh subagents per phase:**
- [std §5 §6 context firewall]. Highest-impact harness change.
- Eliminates context drift between phases.
- Smaller context per call → cheaper, faster, more reliable.

**Case for monolith:**
- Continuity of what was I doing is automatic.
- Worktree state is the shared memory.
- Fewer LLM calls = lower cost in the simple case.

**My take:** Worktree is already a context firewall at the filesystem layer. The Claude process is fresh per phase (subprocess), so technically you already have process isolation. What you do not have: controlled context curation between phases. session_context is a dumb JSONB blob — whoever wrote it decides what carries forward.

**Recommendation:** Keep worktree + subprocess-per-phase. Add a context curator step between phases: a deterministic function (or cheap LLM step) that distills last phase output into a minimum-viable handoff payload, capped at about 2k tokens. Replace the raw session_context dump. Confidence: high.

**What would flip me:** If curator step itself becomes a quality bottleneck (it summarizes wrong). Mitigate with eval coverage on the curator from item 1.

---

### Decision D — HITL as tools vs status-change-as-approval

**Status quo:** Approval = status transitions (planned → approved is human; developed → deploying is human for Complex). Complex items wait at gates; humans toggle status to advance.

**Case for HITL-as-tools:**
- [std §4, 12-factor §7] — same mechanism as other tools, composable, progressive automation.
- Agent can request human input during execution, not just at predefined gates.
- Ask human is auditable as a tool call, not just a status mutation by some user.

**Case for status-as-approval:**
- Already implemented, works.
- Humans understand click approve.
- Status board is the natural UI for what needs me.

**My take:** Both are valid. They solve different problems:
- Status gates = scheduled HITL (we know we will need a human at this checkpoint).
- HITL-as-tools = dynamic HITL (agent realizes mid-execution it needs input).

You need both. Status gates stay. Add a request_human_input(question, context, urgency) tool. Response routes back via webhook/notification.

**Recommendation:** Keep status gates. Add HITL tool for ambiguous mid-execution cases. Confidence: medium-high.

**What would flip me:** If HITL-tool usage stays at zero across 100 sessions — it is a feature with no demand, kill it.

---

### Decision E — Workflow-as-data (v2) vs revert to code

**Status quo:** Workflows stored as JSON. Defined in WorkflowDefinition with nodes + edges. React Flow UI lets users build them visually.

**Case for keeping config-over-code:**
- Multi-tenant: different projects need different workflows without code deploy.
- UI-driven authoring lowers ops bar.
- Versioned per project, queryable.

**Case for reverting:**
- Most projects probably want the same workflow. Why pay generality cost?
- JSON workflows are harder to test, lint, refactor than code.
- Visual editors generate spaghetti at scale (anyone who has used N8N at 50+ nodes knows this).

**My take:** Config-over-code is justified only if at least 3 distinct workflow shapes are in production within 6 months. Otherwise you are paying tax on flexibility nobody uses. Standard library of default workflows + ability to fork is fine. What is NOT fine: every project forced to author its own workflow because there is no good default.

**Recommendation:** Keep workflow-as-data engine (do not rip out). Ship 3 opinionated default workflows — standard pipeline, fast track for Simple-Medium, Complex review-heavy. 95 percent of projects use defaults. Power users fork. Confidence: medium-high.

**What would flip me:** If after 6 months less than 5 percent of projects have custom workflows, the engine is over-built and should be hidden behind a feature flag.

---

## 4. Failure-Mode Audit (8 categories from report §8)

| # | Failure mode | bb exposure | Concrete scenario today | Cheapest mitigation | Fix now or later |
|---|---|---|---|---|---|
| 1 | Hallucinated tool calls | HIGH | Agent invents bumblebee_sprints(action=archive) — action does not exist; MCP wrapper returns Unknown action error which the agent may not understand. Or invents a tool name entirely. | Strict schemas + tool consolidation (#4 in §2). Examples in descriptions. | Now — cheap, high ROI |
| 2 | Context exhaustion / rot | MEDIUM | continue phase with 30+ comments on a long-running bug. Or session_context JSONB carrying a 50k-token analysis blob into the next phase. | Curator step between phases (Decision C). Hard token budget per phase prompt. | Later — start with budget tracking; mitigate when first incident |
| 3 | Goal drift | MEDIUM | analyze phase drifts into implement (I will just write a quick fix while I am here). Or review phase becomes general code coach instead of approve/reject. | Re-anchor goal at phase prompt header. LLM-as-judge in eval suite (#1) catches drift retrospectively. | Later — needs eval baseline first |
| 4 | Infinite loops | MEDIUM-HIGH | reimplement cycle hits 3-cap and stops, but each cycle can spin internal tool loops. The retry caps are at phase level, not within-phase. | Within-session tool-call dedup (same tool + args 3x = error). Combine with cost cap (#2). | Now — within #2 work |
| 5 | Hallucination cascades | MEDIUM | analyze fabricates function foo() exists at line 42; implement reads that as fact, fixes non-existent code; test fails inscrutably. | Provenance tags on session_context fields (verified vs inferred). Curator (Decision C) drops inferences. | Later — needs Decision C |
| 6 | Multi-agent cascading errors | LOW | A2A is sync polling (audited). Single specialist failure propagates back to lead immediately; no fan-out yet. | Schema contracts between agents when fan-out lands. | Defer until fan-out exists |
| 7 | Planning brittleness | MEDIUM | plan made during analyze; world changes during implement (dependent file deleted, branch moved); plan blindly followed. | Plan as mutable; re-evaluate at each implementation step. Hook for world-changed check. | Later — needs taxonomy first |
| 8 | Silent quality degradation | HIGH | Someone tunes the triage prompt to fix one bug; quality drops 10 percent across all items; nobody notices for weeks. | Eval suite (#1 in §2). | Now — the silent killer |

**Highest priority based on this audit:** #1, #4, #8. All three lead back to #1 and #2 from the top-5 recommendations.

---

## 5. Things NOT to Do

The "we considered X and decided not to" list. This is where I earn my keep.

### NOT-1: Full event sourcing right now
Tempting but premature. Use partial append-only log (Decision B). Full event sourcing imposes 3–5x storage cost and schema-evolution pain. You do not have the replay-debug pressure yet.

### NOT-2: Build a custom agent framework
You are not building LangGraph. You are not building Temporal. Resist any v3 plan that includes "design our own DAG runtime with retries, parallelism, side effects, etc." The v2 workflow engine is already enough. Add features as needed. Watch for scope creep where someone says we should make this more powerful — push back hard.

### NOT-3: Add 6 more MCP tools to expose v3 features
You are over budget on tool count [std §3]. Every v3 capability should ask "can existing tools handle this?" first. If a new tool MUST be added, retire one in the same PR. Net tool count goes DOWN in v3, not up.

### NOT-4: Replace status enum with pure graph state
Tempting purity move. Do not. Status is the UX contract with humans. Keep it as a projection (Decision A). Replacing it forces a UI rewrite, a doc rewrite, and breaks every integration. The cost is too high for too little benefit.

### NOT-5: Build per-prompt A/B testing infrastructure
"Run two versions of triage on random splits and compare." Sounds great. Premature. You need (a) eval suite first; (b) volume to make A/B statistically meaningful. At current usage, A/B converges in months. Build eval (#1) first; A/B is a future quarter.

### NOT-6: Move to fully autonomous agent loops anywhere
"Let the agent decide which phase to run next." NO. [std §1] is explicit: workflows for predictable tasks. Bumblebee phases are predictable. Autonomy here adds variance for no observed benefit. Keep deterministic dispatch.

### NOT-7: Migrate worktree storage to remote (S3-style)
Someone will suggest this for "scalability." Do not. Local worktrees are correct for the cost/latency profile. Git is already a content-addressable store. Remote adds latency to every read. If you genuinely outgrow disk, that is a v3.5 problem.

### NOT-8: Replace Python backend with Go/Rust
Do not entertain this. The cost-benefit is terrible. Most latency is in LLM calls, not backend code. Hot path optimization wins zero if you are waiting 3s on Claude.

### NOT-9: Adopt a vector DB for "memory"
Tempting buzzword move. Do not. Your memory is session_context JSONB and git history. That is enough for the agentic patterns Bumblebee runs. Vector DB belongs to RAG-heavy use cases (legal/medical/Q&A). Defer indefinitely.

### NOT-10: Build a general agent mode that handles arbitrary user requests
Resist any feature request shaped like "user types a sentence, agent does whatever it needs." This is the open-ended autonomy trap. Every feature should map to a defined workflow or refuse.

---

## 6. Open Questions / Unknowns

### Q1 — What is the actual prompt-change cadence?
**Unknown:** How often does someone touch triage / analyze / review prompts per week?
**Why it matters:** Justifies eval-suite investment (#1). High cadence → urgent. Low cadence → can defer.
**Resolves via:** Audit git log for prompt-file changes over last 90 days. Cheap, do this first.

### Q2 — How many concurrent sessions per project typically?
**Unknown:** Audit did not show telemetry. Could be 1–2/day or 50/hour. Affects whether queue + budget caps need rework.
**Why it matters:** Per-session cap (#2) target value is 10–50x the typical session cost.
**Resolves via:** Query cost_service for last 30 days of cost_usd distribution. Compute p50/p95/p99.

### Q3 — Are users actually customizing workflows in v2?
**Unknown:** With v2 workflow engine live, is anyone editing the JSON? Or are they all on default?
**Why it matters:** Justifies Decision E direction. If <5 percent custom → ship 3 defaults, hide editor. If >25 percent custom → keep editor as first-class UI.
**Resolves via:** Query v2_workflows.is_default distribution.

### Q4 — How long are agent sessions actually running?
**Unknown:** 45-min timeout exists. p95 likely far below. Or far above.
**Why it matters:** Affects context bloat severity and curator-step design (Decision C).
**Resolves via:** Query agent_sessions.duration_seconds histogram.

### Q5 — What is the actual failure-rate distribution?
**Unknown:** Of failed sessions, what percentage are infra vs assertion vs unknown? Drives taxonomy investment.
**Why it matters:** If 90 percent are assertion_failed (tests fail), the cheap taxonomy is enough. If 50 percent are unknown, need richer detection.
**Resolves via:** Manual sample 50 recent failed sessions, classify by hand.

### Q6 — Is session_context JSONB actually huge?
**Unknown:** Audit found field but did not measure typical size.
**Why it matters:** Validates context-bloat concerns.
**Resolves via:** SELECT pg_column_size(session_context) FROM work_items ORDER BY 1 DESC LIMIT 50. Cheap.

### Q7 — How often do reimplement loops actually fix the problem?
**Unknown:** Of items that go into reimplement, what percent succeed by cycle 2 vs cycle 3? If success at cycle 3 is <10 percent, the loop is wasting money — cap should be 1.
**Why it matters:** Validates failure-taxonomy mitigation choices (#3).
**Resolves via:** Query cycle outcomes from agent_sessions history.

### Q8 — Does agent_stream_log already give us partial event-log capability?
**Unknown:** Audit saw the model exists but did not trace usage. If yes → Decision B is already half-done. If no → it is an orphan.
**Why it matters:** Halves the cost of Decision B.
**Resolves via:** grep for callsites + sample rows.

### Q9 — Are the v2 routes (/api/v2/*) actually used in production traffic?
**Unknown:** Mounted alongside legacy. Could be 0 percent traffic or 50 percent.
**Why it matters:** Decides cutover timing (#5).
**Resolves via:** Log aggregation by route prefix.

### Q10 — Is there appetite for a slowdown to do v3 properly?
**Unknown:** This is a leadership question. v3 done right is ~6–10 weeks of focused work; bolted-on is 2–3 weeks of regret.
**Why it matters:** Sets scope.
**Resolves via:** Have the conversation explicitly. Do not pretend we can do both.

---

## Verdict Summary

**Do now (high confidence):**
1. Eval suite as deployment gate
2. Per-session + per-item cost ceilings
3. MCP tool consolidation with examples

**Do next (medium confidence):**
4. Failure taxonomy with phase-aware mitigation (start with observable failures only)
5. Sunset legacy pipeline_orchestrator.py; consolidate on workflow engine

**Defer (right idea, wrong time):**
- Full event sourcing → start with partial append-only log
- Subagent isolation → add as workflow primitive after #5 lands
- HITL-as-tools → add after status gates prove insufficient
- Context curator → after measurements confirm bloat

**Do not do:**
- Custom agent framework
- Tool expansion
- Status enum removal
- A/B prompt infrastructure (before eval)
- Vector DB
- Backend rewrite

---

## Behavioral Checklist (self-audit)

- [x] Assumptions challenged: user's gap analysis re-scored; gap #7 partially wrong, gap #1 misaimed, gap #5 underweighted
- [x] Alternatives surfaced: 5 distinct architectural decisions (A–E) with both-side debate
- [x] Trade-offs quantified: dev cost / runtime cost / risk for each top-5
- [x] Second-order effects named: silent quality degradation, daily-cap averaging, multi-orchestrator bug-doubling
- [x] Simplest viable option identified: top-5 ranked by ROI; do-nothing path explicitly rejected only where evidence supports it
- [x] Decision documented: this report

---

**Status:** DONE
**Summary:** v2 is ~40 percent aligned with production agent standards (more than expected); the gap is concentrated in evals, cost ceilings, failure taxonomy, and tool surface. Top-3 fixes (eval suite, per-session cost cap, MCP consolidation) are cheap and high-leverage; recommend committing to those before any v3 grand redesign.
**Concerns:** Six of ten open questions are answerable in <30 minutes of DB queries — strongly recommend running those before finalizing v3 scope. Specifically Q5 (failure distribution) and Q1 (prompt-change cadence) are the cheapest investments that prevent over-engineering the v3 plan.
