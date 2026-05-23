# AI Agent Architecture — Standards & Patterns

**Research Date:** 2026-05-17  
**Scope:** Production-grade agent system design principles, patterns, failure modes, and synthesis checklist.  
**Audience:** Engineers building/redesigning agentic platforms (e.g., Bumblebee).

---

## TL;DR

Production agents succeed through:
1. **Clear workflow vs. agent distinction** — use workflows (deterministic code + LLM steps) for predictable tasks; save full autonomy for complex, open-ended work.
2. **Harness first, model second** — the scaffolding (prompts, tools, memory, state) matters more than LLM capability; constraints that prevent failures compound faster than better models.
3. **Context as a constrained resource** — treat context like memory in embedded systems; budget for system prompt, tools, history, and user input; target 60–80% utilization.
4. **Stateless reducers with external memory** — agents as pure functions (input state → output state) enable replay, determinism, and testability.
5. **Small, focused agents** — compose rather than build monoliths; supervisor pattern routes work to specialists; sub-agents return compressed summaries.
6. **Tool use as structured output** — use strict schema enforcement; programmatic orchestration (code) beats round-trip API calls; minimize tool definitions upfront, lazy-load extras.
7. **Observability from day one** — trace + replay every run; continuous evals catch quality drift before users feel it; cost tracking per feature, not just per call.
8. **Failure taxonomy as design guide** — hallucinated tool calls, context exhaustion, goal drift, infinite loops, cascading errors, planning brittleness. Each has specific mitigations; don't address them generically.

---

## 1. Building Effective Agents (Anthropic)

### Workflow vs. Agent: Core Distinction

**Workflows** = orchestrated LLM + tool steps through *predetermined code paths*. Each step is explicit, branches predictable. Example: extract → classify → route → execute. Cost and latency are bounded; output is deterministic given the same input.

**Agents** = LLM *dynamically directs* its own process, choosing tools and next steps based on observations. The agent loop is autonomous: observe state → reason → plan → act → receive feedback → repeat. Flexibility & autonomy cost latency and add variance; hallucination risk is higher. [anthropic]

**When to use each:**
- **Workflows**: customer onboarding, document processing pipelines, code review checklist, form filling, deterministic multi-step business processes
- **Agents**: debugging, exploratory data analysis, creative generation, open-ended research, any task where the optimal path isn't known upfront

Most production "agents" are actually workflows with strategic LLM steps embedded in deterministic code—this is the sweet spot for reliability. Pure autonomy should be reserved for tasks where humans can supervise or where failure cost is low.

### The Five Workflow Patterns

Each pattern solves a distinct orchestration problem. They are *composable*—combine them.

**1. Prompt Chaining**  
Sequential LLM calls; each builds on the last.  
- Task decomposed into fixed subtasks (steps are predetermined).  
- Each step gets a refined prompt + prior outputs as context.  
- Use when: output of step N becomes precise input to step N+1.  
- Example: `extract_requirement → generate_solution_outline → write_code → review_code`  
- Latency: Sum of all LLM calls. Cost: linear in steps.  
- Risk: Error in step N cascades to N+1. Mitigate via validation gates.  

**2. Routing**  
Classify input once; route to specialized handler.  
- First LLM call categorizes the problem (e.g., `billing_issue` vs. `technical_issue`).  
- Route to a specialized prompt/agent for each category.  
- Use when: different input classes need different solutions, multiple domains exist.  
- Example: "Classify customer message as bug-report / feature-request / billing-dispute; then call appropriate agent."  
- Latency: 1 classify call + 1 handler call (not much overhead).  
- Benefit: Each handler can be fine-tuned for its domain; cleaner prompts overall.  

**3. Parallelization**  
Multiple independent tasks run simultaneously.  
- **Sectioning**: Break work into independent subtasks; run in parallel; merge results.  
- **Voting**: Run the same task N times; aggregate results (majority vote, ensemble).  
- Use when: subtasks don't depend on each other, or quality matters more than latency.  
- Example: Analyze three different architectural approaches in parallel; voting mode: run the same planning step 3× with different random seeds.  
- Latency: max(parallel calls) instead of sum. Cost: scales with N tasks/attempts.  
- Tradeoff: Higher cost & token use for improved quality or coverage.  

**4. Orchestrator-Workers**  
Central LLM breaks down complex, unpredictable tasks and delegates to worker agents.  
- Orchestrator receives goal, plans decomposition dynamically, routes work to workers.  
- Each worker is a specialized agent with its own tools.  
- Orchestrator waits for results, synthesizes final answer.  
- Use when: task structure is not known upfront; subtasks are heterogeneous.  
- Example: Large refactor - orchestrator identifies code modules affected, spawns worker agents for each module, collates results.  
- Latency: Orchestrator latency + max(worker latencies) + synthesis.  
- Risk: Orchestrator hallucinating task breakdown. Mitigate via validation, clear hand-off formats.  

**5. Evaluator-Optimizer**  
Generate response, then evaluate/critique it in a loop.  
- Generator produces draft output.  
- Evaluator assesses it against rubric (clarity, correctness, completeness).  
- If fails rubric, optimizer regenerates; loop until pass or max_attempts.  
- Use when: clear evaluation criteria exist; iterative refinement is acceptable.  
- Example: Code review loop - generator writes code, evaluator checks correctness/style, regenerate on fail.  
- Latency: N × (generate + evaluate) where N = iterations.  
- Cost: Higher (multiple passes), but quality is predictable if rubric is solid.  
- Caveat: Evaluation rubric must be clear and reliable; bad rubric = infinite loops or false passes.  

---

## 2. 12-Factor Agents (Dex Horthy, HumanLayer)

A manifesto for production-grade agent software. Inspired by 12-factor apps; answers "What makes LLM-powered software reliable enough for production customers?"

Core insight: Most successful AI products are ~80% deterministic code + ~20% LLM steps (workflows), *not* pure autonomy. Modular agent patterns incorporated into existing products beat framework-centric rewrites. [humanlayer-12-factor]

### The 12 Factors (with essence + why it matters)

**1. Natural Language → Tool Calls**  
Convert user intent into structured function calls.  
Why: Deterministic code handles structured data; LLMs convert language → structure once, then engines execute. Reduces hallucination feedback loops.

**2. Own Your Prompts**  
Direct control of prompt engineering; don't delegate to framework defaults.  
Why: Framework prompts are generic; your domain is specific. Ownership enables fine-tuning to your codebase, conventions, failure modes.

**3. Own Your Context Window**  
Actively curate what info enters the LLM's context. Don't let frameworks auto-inject everything.  
Why: Context is a budget (tokens = cost + latency). Bloat → poor decisions. Ownership enables dynamic allocation, relevance-ranked info, summarization strategies.

**4. Tools Are Structured Outputs**  
Treat tool definitions as output schemas, not function signatures.  
Why: Strict schema enforcement (e.g., `strict: true` in Claude API) guarantees valid JSON. Reduces parsing errors, hallucinated tool calls.

**5. Unify Execution State & Business State**  
Single source of truth for agent progress. No drift between execution log and application state.  
Why: Avoids "did this action actually happen?" ambiguity. Enables idempotency, replay, audit trails. Catastrophic when misaligned (double-charge, duplicate work).

**6. Launch / Pause / Resume with Simple APIs**  
Agents start, suspend, and resume execution via straightforward interfaces.  
Why: Humans need to interrupt, reprioritize, hand off work. Simple APIs enable seamless HITL (human-in-the-loop) integration.

**7. Contact Humans with Tool Calls**  
Use the same tool-calling mechanism to route decisions to humans; don't hardcode special cases.  
Why: Consistent architecture; humans are just another tool in the composition. Enables progressive automation (start with HITL, graduate to full autonomy as confidence grows).

**8. Own Your Control Flow**  
Explicitly manage agent loops; don't rely on framework magic.  
Why: Frameworks obscure control flow; hard to debug, add constraints, or understand where failures occur. Ownership enables custom retry logic, circuit breakers, timeouts.

**9. Compact Errors into Context Window**  
Summarize failures concisely; keep error info useful within token limits.  
Why: Long error stack traces bloat context, waste tokens, make agent lose focus. Distill failures into actionable summaries (e.g., "test_payment_integration failed: expected 200, got 500").

**10. Small, Focused Agents**  
Narrow-purpose agents over monolithic ones.  
Why: Fewer tools → clearer decisions. Reusable across projects. Easier to test, monitor, iterate on. Monoliths with 50+ tools suffer from tool selection ambiguity.

**11. Trigger from Anywhere; Meet Users Where They Are**  
Agents launch from multiple event sources; integrate into existing UIs.  
Why: Agentic work shouldn't be siloed in a special interface. Embed in Slack, issue trackers, dashboards, email—users already live there.

**12. Make Your Agent a Stateless Reducer**  
Agent = pure function: (state) → (new_state, output).  
Why: Enables determinism, replay, testability, composition. State lives externally (DB, queue, session store); agent is the transformation logic.

---

## 3. Design Patterns for Agents

Core patterns—used in combinations—across industry. Understand when to apply each.

### ReAct (Reasoning + Acting)

**Pattern:** Agent alternates Thought → Action → Observation → Thought → ... until done.  
Example trace:
```
Thought: The user asked for a code review. I need to read the PR, understand changes, identify issues.
Action: read_pr(pr_id=123)
Observation: [file1.ts: changed auth logic; file2.ts: new test added]
Thought: Auth changes are risky. I should check for security issues, test coverage.
Action: check_security(file1.ts)
Observation: [No SQL injection detected. Password hashing present.]
Thought: Security looks OK. Now review test coverage.
Action: check_tests(file2.ts)
Observation: [3 tests added, 98% coverage]
Thought: All checks passed. I'll summarize findings.
Action: return_review(...)
```

**When to use:** Default pattern for most agents. Good for exploratory tasks, debugging, multi-step reasoning where each step reveals what's next. Doesn't pre-plan; reacts to observations. Flexible but can be slow (many round-trips).

**Risks:** Observation noise → agent loses focus. Infinite loops if poorly constrained. Tool ambiguity at each step. [anthropic]

---

### Reflection (Self-Critique)

**Pattern:** Agent generates output, then explicitly critiques itself before responding.  
Example:
```
Initial response: "The function should use forEach to iterate."
Reflection: "Wait—the requirements say 'minimize allocations'. forEach is less efficient than for-loop here. I should revise."
Final response: "Use a for-loop to minimize memory allocations."
```

**When to use:** When quality matters more than latency. Code generation, content writing, decision-making with clear rubrics. Especially powerful for catching self-contradictions, checking constraints.

**Risks:** Reflection can be too harsh (rejects valid solutions) or too lenient (approves bad ones). Rubric quality determines success.

**Implementation:** Separate evaluator phase or integrated via system prompt that prompts critique.

---

### Planning (Decomposition)

**Pattern:** Agent receives goal, *first* generates a plan, then executes steps.  
Example:
```
Goal: Refactor authentication module
Plan:
1. Identify all files depending on auth module
2. Extract common patterns
3. Create new abstraction layer
4. Migrate each caller to new API
5. Add integration tests
6. Remove old code
Execution: Agent follows plan, checking off steps; replans if world changes.
```

**When to use:** Complex, multi-step tasks with high cost to wrong choices. Requires approval-friendly output (human can review plan before execution). Enterprise workflows, code migration, organizational changes.

**Risks:** Plans age fast. World changes mid-execution; agent must detect and replan. If agent rigidly follows broken plan, cascading failures. Mitigate: treat plan as mutable; re-evaluate at checkpoints (not just "check off steps").

**Research shows:** Structured planning increases accuracy from ~40% to 96% in enterprise tasks. [llamaindex]

---

### Tool Use (Function Calling)

**Pattern:** Agent calls tools (functions/APIs) to interact with systems.  
Progression:
- **Stage 1 (Basic):** Tools are function definitions; model decides which to call and with what args.  
- **Stage 2 (Structured Outputs):** Strict schema enforcement (`strict: true`) guarantees valid JSON, no parsing errors.  
- **Stage 3 (Programmatic Orchestration):** Agent writes code that calls tools; intermediate results stay in execution environment, not context window.

**Reliability improvements:**  
- Without structure: "Best effort" JSON → 80–85% valid  
- With `strict: true`: 100% valid JSON (constrained decoding)  
- With programmatic orchestration: 37% token reduction on complex research tasks (intermediate data doesn't re-enter context). [anthropic-advanced-tool-use]

**When to use:** Every production agent. No agent without tools has meaningful impact (can't read files, query DBs, call APIs, trigger actions).

**Design best practices:**
- Keep tool count low (< 10 for single agent). Add more → ambiguous decisions.  
- Tool descriptions must be crystal clear; overlap causes confusion.  
- Use examples in tool definitions (moving beyond JSON schema). Example-driven calling improves accuracy from 72% to 90% on complex parameters. [anthropic-advanced-tool-use]  
- Lazy-load tools via tool search (defer_loading: true): 85% token reduction while keeping access to 50+ tool library. [anthropic-advanced-tool-use]  
- Structured outputs + function calling together: Use function calling for agent to decide actions; use structured outputs to guarantee final response shape for UIs. [structured-outputs-guide]

---

### Multi-Agent: Supervisor Pattern

**Pattern:** Coordinator agent decomposes goal, routes work to specialized workers, synthesizes results.  
Example architecture:
```
User Query
    ↓
[Supervisor Agent]
    ├─→ Route to: [Code Agent] (has code tools)
    ├─→ Route to: [Data Agent] (has SQL, analytics tools)
    └─→ Route to: [Ops Agent] (has deployment, infra tools)
    
Each returns: (success, result, context_used)
    ↓
[Supervisor] synthesizes final answer
```

**When to use:** Complex multi-domain tasks where one agent can't handle it all. Scales better than monolithic agent with 50 tools. Each specialist can be tuned, tested independently. BASF case study: sales reps need answers from both structured data (Genie agents) and unstructured docs (function-calling agents); supervisor routes queries. [databricks-supervisor]

**Benefits:**
- Modularity: agents are independent, reusable  
- Clarity: router decisions are logged, auditable  
- Testability: each agent tested in isolation  
- Scalability: add new agents without touching existing ones  

**Risks:** Supervisor must decompose correctly. If supervisor hallucinate subtasks, workers get confused. Mitigate via validation, clear task boundaries, structured hand-off formats.

---

### Hierarchical Multi-Agent

**Pattern:** Layers of agents; top level handles high-level goal, delegates to mid-level which delegates to low-level.  
Use case: Multi-million-line codebase; top-level agent decides "refactor module A, update tests, deploy to staging"; mid-level agents own "refactor" and "deploy" workflows; low-level agents own specific files/tools.

**When to use:** Massive, multi-domain systems. Rare in practice for most organizations (supervisor is usually sufficient).

---

### Evaluator-Optimizer Loop

**Pattern:** (Covered under workflow patterns, section 1.5) Generate output → evaluate → regenerate if fails.

**Integrated into agents:** Agents with built-in self-evaluation at decision points.

---

## 4. Production Concerns

What separates hobby projects from systems people depend on.

### Observability & Tracing

**What to trace:**
- Full execution trace per agent run: all LLM calls, tool invocations, decisions, failures.  
- Prompt versions (what was sent to the model).  
- Token counts: input, output, cache hits (Claude APIs).  
- Latency per step.  
- Tool call arguments + results (redact sensitive data).  
- Session state snapshots at key points.  

**Why:** Debugging is impossible without traces. Production failures are always "weird edge case + context nobody captured." Replay-from-checkpoint is critical for understanding "how did we get here?"

**Tools:** LangSmith, Braintrust, Langfuse, Galileo. LangSmith tightly integrated with LangChain. Braintrust emphasizes rigorous evals. Langfuse is open-source baseline. Galileo is best-in-class for evals. [observability-guide]

---

### Evaluation (Evals)

**Three-layer model:**
1. **Model-level evals**: Does the LLM follow instructions? (Benchmark on public datasets, private rubrics)  
2. **Agent-level evals**: Does the agent complete task correctly? (Run agent against test scenarios; compare output to golden answers)  
3. **System-level evals**: Does the multi-agent system work end-to-end? (Test full workflow; check latency, cost, human satisfaction)

**Production practices:**
- **Offline (static) evals:** Run against fixed datasets; fast, cheap, repeatable. Gate deployments.  
- **Online (dynamic) evals:** Run asynchronously on real user runs; don't block agent. Catch quality drift before users notice.  
- **LLM-as-judge:** Feed agent execution trace to a strong model with detailed rubrics. Automate eval when deterministic metrics don't exist.  
- **Regression testing:** Every deploy should pass evals that caught previous bugs.  

**Key insight:** Failures should become test cases; test cases should gate deployment. Observability without evals = dashboards that nobody acts on. Evals without observability = benchmarks that don't reflect production. [observability-guide] [braintrust-evals]

---

### Replay & Determinism

**Goal:** Re-run agent from checkpoint and reach same state + output (modulo randomness in tool results).

**Why critical:**
- Debugging: "Run this request again with debug logs."  
- Fixing: "Agent chose wrong path; fix the prompt, replay from step 3."  
- Auditing: "What decision led to this outcome?"  

**Implementation:**
- Persist full session state (including RNG seed, tool args, results) at checkpoints.  
- Make tool calls idempotent (retrying a tool call produces same result).  
- Log every randomness source (temperature, seed, sampling strategy).  
- Version prompts; store executed prompt version, not current version.  

---

### Cost & Latency

**Hidden Economics:**
- Single LLM call: ~800ms.  
- Orchestrator-Workers loop (with reflection): 10–30 seconds.  
- Multi-agent system with serial phase: 2–5 minutes.  

The "Unreliability Tax": Agentic systems introduce probabilistic uncertainty into deterministic software. You pay extra in compute + latency + engineering to mitigate failures. Budget for 3–5× baseline cost to account for retries, evals, replays. [economics-of-agents]

**Token tracking essentials:**
- Per request: input + output tokens, cache hits.  
- Per user: cumulative daily/monthly spend (Pareto often 20% of users = 80% of tokens).  
- Per feature: Which features cost most? (planning + replan loops are expensive; tool calls with large outputs bloat context).  
- Per pipeline step: Orchestrator → Worker 1 → Worker 2 → Synthesis. Where do tokens go?

**Optimization levers:**
- Token caching (90% input cost reduction, 75% latency reduction) [anthropic-cache]  
- Semantic caching (up to 73% cost reduction via dedup similar requests) [cache-optimization]  
- Context compression (summarize long tool outputs before re-entering context) [anthropic-context-engineering]  
- Lazy tool loading (85% token reduction via tool search) [anthropic-advanced-tool-use]  
- Prompt optimization (remove redundancy, compress examples) [economics-of-agents]  

**Latency constraints:**
- Real-time voice: < 1000ms (sub-500ms is gold standard) [latency-benchmarks]  
- Chat: < 3 seconds acceptable, < 10 seconds feels slow [latency-benchmarks]  
- Background jobs: No constraint, but cost matters.  

---

### Retries, Idempotency, Dead-Letter Queues

**Idempotency** = Retrying an action produces same result (no double-charge, duplicate work, etc.).  
Implement via idempotency key (stable identifier for intent: user_id + action_type + params hash).  
Real systems always retry: webhooks fail, APIs timeout after succeeding, workers crash.

**Retry strategy:**
- Exponential backoff: 1s → 2s → 4s → 8s ... (avoids hammering system).  
- Jitter: Add randomness to backoff (prevents thundering herd if N retries fire simultaneously).  
- Max retries: 3–5 is typical; after that, likely a permanent failure, not transient.  

**Dead-Letter Queue (DLQ):**
- Messages that fail after max retries go to DLQ.  
- DLQ items reviewed manually: resolve root cause, optionally replay.  
- Prevents backlog from cascading (failed item won't block subsequent items in queue).  

**For agents:** Agent runs that fail should be retried (different random seed, warmer context from first attempt). After N retries, route to human review (DLQ).

---

### Human-in-the-Loop Gates

**Where humans matter most:**
- Complex work approval (before expensive execution)  
- Ambiguous decisions (agent unsure)  
- Risky actions (deployments, deletions)  
- Escalation (agent failed N times; hand off to human)  

**Implementation:** HITL as a tool. Agents call `request_human_approval(action, context)`. Human responds yes/no/request_changes. Same mechanism as other tools; composable, auditable. [12-factor, factor 7]

**Common pattern:** Suggest phase (async, low-cost) → human review + approval → Execute phase (higher cost, lower variance).

---

## 5. Harness Design

The scaffolding around the LLM is more load-bearing than the model itself. "A decent model with a great harness beats a great model with a bad harness." [addyosmani-harness]

### What's in a Harness

1. **Prompt composition engine**: System prompt assembled from modules (cacheable vs. non-cacheable sections for cost optimization).  
2. **Tool registry**: Tools and MCP servers; lazy-loaded or pre-specified.  
3. **Context assembly**: Decision logic for what goes into each API call (history truncation, retrieval, summarization).  
4. **Execution layer**: Sandboxed environment (Docker, WebAssembly, etc.) for safe tool execution.  
5. **State management**: Session state storage, persistence layer, checkpoint/restore.  
6. **Hooks**: Lifecycle events (on_start, on_tool_call, on_error, on_complete) where custom logic runs.  
7. **Memory systems**: Short-term (conversation history), long-term (cross-session learning), external (file system, DB).  
8. **Documentation**: CLAUDE.md / AGENTS.md files encoding project conventions, constraints, known failure modes.  

### Good Harness Design Properties

- **Constraint-driven:** Rules trace to past failures. "Every rule in this harness solved a real problem we had."  
- **Observable:** All decisions visible; easy to see why agent chose X.  
- **Recoverable:** Stateless reducers + checkpointing enable replay and fault recovery.  
- **Modular:** Tools, skills, subagents are independent; composition over monolith.  
- **Efficient:** Context budgeting prevents waste; compression strategies keep history useful.  

### Configuration Levers (in order of impact)

**1. Subagents (most powerful)**  
Isolate discrete tasks in separate context windows. Eliminates intermediate noise accumulation. "Context firewall" pattern.  
Example: Main agent coordinates; specialist agent for "analyze PR comments"; second specialist for "write commit message". Each returns compressed summary.  
Trade-off: Extra latency per agent spawn, but dramatic coherence improvement.  

**2. CLAUDE.md / AGENTS.md Files**  
Project conventions, constraints, known failure modes. Keep concise (<60 lines). Auto-generated files hurt performance; human-written, succinct ones show marginal gains. [humanlayer-harness]  
What to include: "always use X pattern for Y tasks," "never do Z without human approval," "test failures usually indicate...", "watch out for these three footguns."  

**3. Hooks**  
Automate control flow at lifecycle points.  
- on_tool_call: Validate tool args before execution.  
- on_error: Summarize errors concisely; trigger backpressure.  
- on_complete: Save state, log metrics.  
Example: Hook that runs typecheck before accepting code changes; agent sees only errors, not full output (context efficient).  

**4. Back-Pressure (Verification Loops)**  
Agent verifies work via tests, typecheck, build. Keep checks context-efficient: surface errors only, silence on success.  
Prevents hallucinated code from shipping.  

**5. Skills (Progressive Disclosure)**  
Bundle reusable instructions + tools without cluttering main prompt. Revealed only when needed.  
Risk: Malicious skills exist in registries; vet carefully before use.  

**6. MCP Servers**  
Use primarily for tools, not instructions. Too many tool descriptions bloat context dangerously.  
Consider simple CLIs instead if agent already understands them (from training data).  

**7. Prompts**  
Own them. Don't rely on framework defaults. Fine-tune system prompt, examples, constraints to your domain.  

### Anti-Patterns

- Over-specifying: 500-line system prompt with edge cases → agent ignores tail end, uses first 100 lines.  
- Tool overload: 50+ tools → agent confused on every decision.  
- Framework magic: "Let framework handle retries" → can't debug, understand, or customize behavior.  
- Monolithic agents: One agent with 50 tools doing 5 unrelated jobs → low coherence, slow.  
- Stateful agents: Agent state + application state drifting → audit nightmares.  

### The Ratchet Principle

Every constraint in your harness should trace to a specific past failure. Over time, harness accumulates rules, becoming increasingly tailored to your codebase and failure patterns. This is *desired*—constraints that prevent recurring failures compound faster than model improvements. [addyosmani-harness]

---

## 6. Context Engineering

Context window is a constrained resource—like memory in embedded systems. The shift from "prompt engineering" to "context engineering" is the key evolution in agent reliability. [anthropic-context-engineering]

### Core Principles

1. **Context as a budget:**  
   - Input tokens + output tokens = cost.  
   - Finite attention: LLMs degrade at high token counts (context rot).  
   - Target 60–80% utilization (leave headroom for model thinking).  

2. **Minimal, high-signal tokens:**  
   - Find the smallest possible set that maximizes success likelihood.  
   - Remove redundancy, compress history, discard low-signal outputs.  

3. **Context rot / attention decay:**  
   - Accuracy on long inputs drops (95% → 60–70%) even when task doesn't change. [agent-drift]  
   - Later tokens get less attention due to transformer architecture.  
   - Larger context windows don't solve this; they just delay onset. [agent-drift]  

### What Goes Where in Context

| Component | Purpose | Size | Notes |
|-----------|---------|------|-------|
| **System Prompt** | Behavior spec, constraints, examples | 500–2000 tokens | Own it; fine-tune to domain. Keep tight. |
| **Tools** | Function definitions, MCP, examples | 500–2000 tokens | Use tool search / lazy-load if >10 tools. Include examples (72% → 90% accuracy). |
| **Conversation History** | Prior turns (user request, assistant response) | Variable | Compress or truncate for long runs. |
| **Retrieved Context** | RAG results, doc excerpts, code snippets | 1000–5000 tokens | Rank by relevance; discard low-signal. |
| **Working Memory** | Scratchpad, task list, session context | 500–1000 tokens | Externalize to reduce window clutter. |
| **Error Context** | Tool failures, stack traces | 200–500 tokens | Compact into summary; full traces bloat. |

**Token tracking:** Monitor cumulative context usage. If 90%+ of a 200k-token window is filled before agent starts reasoning, you've budgeted wrong.

### Compaction Strategies

**History compression:** Summarize old turns. Preserve critical decisions, details; discard redundant outputs.  
Example:
```
[Old history]:
Assistant: "I reviewed file A. Issues: missing null check on line 42."
User: "Fix it"
Assistant: "Fixed. Now checking file B..."

[Compacted]:
"Reviewed file A, fixed null check line 42. Checked file B. Key findings: [...]"
```

**Tool output reduction:** Tool results often verbose (full API response, large text). Extract only relevant fields.  
Example: Instead of full GitHub API response, return `{pr_status: "open", reviews: 2, changes_requested: true}`.

**Structural note-taking:** Agents maintain external memory files (scratchpad.md, session.json) across context resets. Enables coherence over long tasks without bloating context.

### Subagent Isolation (Context Firewall)

Main agent spawns specialist subagents for focused tasks. Each subagent:
- Gets fresh context (no noise from earlier steps).  
- Operates independently.  
- Returns compressed summary to main agent.  

Eliminates accumulation of intermediate noise. Biggest bang-for-buck for long-running tasks.

---

## 7. The Bitter Lesson Applied to Agents

Rich Sutton's "Bitter Lesson" (2019): *General methods that leverage computation ultimately win; specific human knowledge plateaus.* [bitter-lesson]

**Applied to agents:**
- **Don't hand-craft control flow.** Let the agent learn via interaction (ReAct pattern, observation-based replanning).  
- **Don't hard-code domain knowledge.** Use retrieval (RAG) + search to bring relevant context dynamically.  
- **Don't scaffold too much.** Overly detailed prompts with 100 edge cases → agent ignores them, learns only first 20 rules.  
- **Scale compute wisely.** More capable models, longer context, more tools, better observability—all leverage compute to improve reliability.  

**But:** Current LLMs are not general reasoners like chess engines. They're pattern matchers with stochastic outputs. So:
- **Use workflows for predictable tasks** (deterministic code paths beat agentic reasoning when outcome space is known).  
- **Use agents for open-ended tasks** (generative, exploratory, require novel reasoning).  
- **Combine:** Workflows with embedded agentic steps (e.g., deterministic routing + agentic analysis within each route).  

**Practical synthesis:** The bitter lesson says "general compute beats hand-crafted structure." But that doesn't mean *no* structure. Rather: "Minimize scaffolding friction; let the harness enable the model to reason freely." Constraints should prevent failure modes, not dictate solutions.

---

## 8. Failure Modes Taxonomy

Understanding failure modes is design guidance. Each failure has specific mitigations; don't address generically. [microsoft-taxonomy] [nimblebrain-failures] [wire-blog-drift]

### Hallucination & Tool Misuse

**Hallucinated tool calls:** Agent invents tools that don't exist or calls real tools with invalid arguments.  
- **Cause:** Ambiguous tool descriptions, overlapping tool names, no examples.  
- **Symptom:** Tool call fails; agent retries same call or silently proceeds with fabricated result.  
- **Mitigation:**  
  - Strict tool schemas (`strict: true`).  
  - Clear, non-overlapping tool descriptions.  
  - Include examples in tool definitions.  
  - Validate tool args before execution; return clear error messages if invalid.  

**Tool selection errors:** Agent picks wrong tool for task (multiple tools could work; agent chooses suboptimal one).  
- **Cause:** Too many similar tools; unclear descriptions.  
- **Mitigation:** Keep tool count low (<10 for single agent). Use supervisor pattern to route to specialist agents.  

---

### Context Exhaustion & Loss

**Context window overflow:** Agent runs out of tokens before completing task.  
- **Cause:** Long conversation history + verbose tool outputs + large code samples bloat context.  
- **Symptom:** Agent stops mid-reasoning, returns truncated output, or "sorry I ran out of space."  
- **Mitigation:**  
  - Track context usage real-time.  
  - Compress history proactively.  
  - Externalize long-term state (files, DB).  
  - Use subagents to isolate work (context firewall).  

**Context rot (attention decay):** Agent performance degrades on long inputs (early info becomes "functionally invisible").  
- **Cause:** Transformer attention distribution; later tokens dominate.  
- **Symptom:** Accuracy drops 95% → 60–70% on same task with longer history, even if early info is still present.  
- **Mitigation:**  
  - Re-anchor goals periodically (re-state primary objective).  
  - Prioritize recent context; summarize older turns.  
  - Use external memory for facts that must survive long context.  

**Instruction fade:** Agent drifts from original instructions as conversation extends.  
- **Cause:** System prompt gets buried under conversation history; later turns receive more attention.  
- **Symptom:** Agent violates constraints stated in system prompt (e.g., "always check with human before deploy" → agent deploys without asking).  
- **Mitigation:**  
  - Periodically reinject system prompt (hooks at decision points).  
  - Use role-pinning (re-anchor agent's persona/purpose).  
  - Keep system prompt tight; remove low-signal guidance.  

---

### Goal Drift

**Goal drift:** Agent substitutes secondary objectives for primary goal over time.  
- **Cause:** Intermediate observations (tool outputs) nudge attention away; agent defaults to recent task without reconnecting to original goal.  
- **Symptom:** Agent starts as "review code for security," ends as "optimize code for performance" (secondary goal took over).  
- **Mitigation:**  
  - Re-anchor primary goal frequently (hooks on major decisions).  
  - Track session context (what was the original goal? what progress made?).  
  - Evaluate against original goal at end, not just intermediate tasks.  

**Context drift:** Accumulated observations spread attention thin; early context becomes invisible.  
- **Mitigation:** (Same as context exhaustion → use compression, subagents, external memory.)  

**Role drift:** Agent's persona erodes (e.g., "security reviewer" becomes "generic code analyst").  
- **Cause:** System prompt loses influence relative to accumulated history.  
- **Mitigation:** Role-pinning: reinject system prompt at decision points.  

---

### Infinite Loops & Retries

**Infinite loop:** Agent calls same tool repeatedly with same arguments, expecting different result.  
- **Cause:** Tool returns error; agent doesn't understand and retries identically.  
- **Symptom:** Same tool call, same error, repeated 5+ times. Agent "stuck."  
- **Mitigation:**  
  - Detect repeats (if same tool + args in last 3 calls, break loop; escalate to human).  
  - Return clear error messages from tools (not cryptic stack traces).  
  - Agent learns: "If tool X returns error E, try approach Y instead."  

**Polling loops:** Agent polls a webhook/API in a tight loop instead of idle waiting.  
- **Cause:** No async/webhook capability; agent defaults to polling.  
- **Symptom:** Excessive API calls, high cost, high latency.  
- **Mitigation:** Provide async tools (e.g., `request_notify_when_done(task_id)` instead of `poll_status(task_id)`).  

---

### Hallucination Cascades

**Single hallucination → downstream errors:** Agent hallucinates data (e.g., "PR has 3 approvals" when it has 0) → other agents depend on that → compounding errors.  
- **Cause:** Agent confident in wrong inference; re-enters fabricated output as fact into context.  
- **Symptom:** Multiple agents fail with different errors, all traceable to original hallucination.  
- **Mitigation:**  
  - Provenance tagging: label statements as instruction / verified_fact / inference / hallucination_risk.  
  - Fact-check before re-entering context.  
  - In multi-agent systems, worker returns (data, confidence, source) tuple; supervisor checks confidence.  

---

### Cascading Errors in Multi-Agent Systems

**Mismatch between agents:** Agent A outputs format that Agent B doesn't expect.  
- **Cause:** No contract enforcement; agents evolved independently.  
- **Mitigation:** Define contracts (schemas) for agent-to-agent hand-offs. Validate in supervisor.  

**Stale state:** Agent A makes decision based on old state; by the time Agent B acts, state has changed.  
- **Cause:** No synchronization; each agent fetches state independently.  
- **Mitigation:** Unify execution state & business state (12-factor principle #5). Single source of truth.  

---

### Planning Brittleness

**Brittle plans:** Agent commits to plan, world changes mid-execution, agent blindly follows broken plan.  
- **Cause:** Plan treated as instruction list, not mutable state.  
- **Symptom:** Agent executes steps 1–5 correctly, step 6 fails because world changed; agent doesn't replan.  
- **Mitigation:**  
  - Treat plan as mutable. Re-evaluate at checkpoints (not just "check off steps").  
  - Agent detects: "My assumption about X is no longer true; I should replan."  
  - Include contingencies in plan: "If X happens, try Y instead."  

---

### Silent Quality Degradation

**Quality drift:** Agent output degrades gradually (imperceptible per-run, shocking over weeks).  
- **Cause:** Model updates, data shift, prompt drift, changing user expectations.  
- **Symptom:** Evals were passing; now they're failing, but nobody noticed until complaints piled up.  
- **Mitigation:** Continuous monitoring. Track metrics (success rate, user satisfaction, cost-per-success) daily. Alert on trends.  

---

## 9. Synthesis: Production-Grade Agent System Checklist

### Architecture

- [ ] **Clarify workflow vs. agent.** Which tasks are deterministic workflows (orchestrated steps)? Which need autonomy (agent loop)? Document decision per feature.  
- [ ] **Choose orchestration pattern.** Prompt chaining? Routing? Parallelization? Orchestrator-workers? Evaluator-optimizer? Combination?  
- [ ] **Plan multi-agent if needed.** Supervisor pattern for domain specialist routing, or hierarchical for deep nesting?  
- [ ] **Design harness.** What tools? What context? Subagent breakdown? Hooks for control flow?  
- [ ] **State machine clarity.** Agent states (pending → executing → complete / failed). Transitions explicit, observable.  

### Tool Design

- [ ] **Keep tool count low.** Start with <10 per agent. Lazy-load if more needed.  
- [ ] **Tool descriptions are crystal clear.** Non-overlapping names. Precise purpose. No ambiguity.  
- [ ] **Include examples in tool definitions.** Example-driven (not just schema). Accuracy 72% → 90%.  
- [ ] **Strict schema enforcement.** Use `strict: true` or equivalent. 100% valid JSON guaranteed.  
- [ ] **Programmatic orchestration.** Agents write code to call multiple tools; intermediate results don't re-enter context. 37% token savings.  

### Context Engineering

- [ ] **Budget context upfront.** How many tokens for system prompt? Tools? History? Reserve room for reasoning.  
- [ ] **Compress history.** Summarize old turns; keep critical decisions, details.  
- [ ] **Externalize long-term state.** Session data in file/DB, not context.  
- [ ] **Tool output reduction.** Return only relevant fields, not full responses.  
- [ ] **Re-anchor goals.** Periodically restate primary objective (hooks on major decisions).  
- [ ] **Monitor context rot.** Track accuracy vs. context length. Detect attention decay.  

### Harness & Configuration

- [ ] **Own your prompts.** Don't use framework defaults; fine-tune system prompt to domain.  
- [ ] **CLAUDE.md / AGENTS.md.** Concise (<60 lines) project conventions, known failure modes, constraints.  
- [ ] **Hooks at lifecycle events.** on_tool_call, on_error, on_complete. Automate control flow.  
- [ ] **Back-pressure loops.** Agent verifies work (tests, typecheck) before proceeding.  
- [ ] **Subagents for isolation.** Specialist agents with fresh context; return compressed summaries. Context firewall pattern.  

### State Management

- [ ] **Unify execution & business state.** Single source of truth. No drift.  
- [ ] **Stateless reducers.** Agent = pure function. State lives externally.  
- [ ] **Checkpoint / restore.** Save state at key points. Enable replay from checkpoint.  
- [ ] **Idempotency.** Retrying action produces same result. Idempotency keys for all side effects.  

### Reliability

- [ ] **Retry strategy.** Exponential backoff, jitter, max retries (3–5). Detect infinite loops.  
- [ ] **Dead-letter queue.** Failed items after max retries go to DLQ for manual review.  
- [ ] **HITL gates.** Critical decisions route to humans via tool calls (same mechanism as other tools).  
- [ ] **Fault detection.** Catch hallucinations, context exhaustion, goal drift, cascading errors.  
  - Hallucination: Provenance tags. Fact-check before re-entering context.  
  - Context exhaustion: Track usage real-time. Escalate if 85%+.  
  - Goal drift: Re-anchor goals periodically.  
  - Cascading: Contracts between agents. Supervisor validates.  

### Observability

- [ ] **Full tracing.** Every LLM call, tool invocation, decision logged. Prompt versions stored.  
- [ ] **Session replay.** Deterministic checkpoint → restore → rerun. Debugging from "I saw X fail; reproduce exactly."  
- [ ] **Token tracking.** Per request, per user, per feature. Identify cost drivers.  
- [ ] **Latency tracking.** Per agent, per tool, per phase. Identify bottlenecks.  
- [ ] **Cost tracking.** Real-time alerts if cost/hour exceeds threshold. Prevent runaway loops.  

### Evaluation

- [ ] **Three-layer evals.** Model-level (instruction following), agent-level (task completion), system-level (end-to-end).  
- [ ] **Offline evals.** Gate deployments with regression tests on fixed datasets.  
- [ ] **Online evals.** Async monitoring on production runs. Catch drift early.  
- [ ] **LLM-as-judge.** Automated rubric-based evaluation when metrics are soft.  
- [ ] **Failure → test case loop.** Every production failure becomes a test case. Tests gate future deployments.  

### Deployment & Monitoring

- [ ] **Deterministic deployment.** Same prompt version, same tool set, same config → same behavior.  
- [ ] **Gradual rollout.** Shadow mode (run on subset, don't use output) → canary (X% of requests) → full.  
- [ ] **Rollback capability.** Can revert to previous prompt/config in seconds.  
- [ ] **Alert thresholds.** Success rate drops? Cost spikes? Tool errors increase? Alert.  
- [ ] **Human escalation.** Ambiguous decisions, repeated failures, unforeseen scenarios route to human review.  

### Documentation

- [ ] **Architecture doc.** Workflow patterns used, agent boundaries, supervisor routing rules.  
- [ ] **Tool reference.** Purpose, args, examples, error conditions for each tool.  
- [ ] **Failure runbook.** "If X happens, try Y." Known failure modes + mitigations.  
- [ ] **Prompt versions.** Why did we change prompt on date Z? What problem did it solve?  

---

## 10. Unresolved Questions

Research didn't yield definitive answers for these (marked throughout as `[unverified]` where applicable):

1. **Optimal context window size for agents:** Is 200k tokens overkill? What's the sweet spot for cost vs. coherence? (Intuition: 50–100k for single agents; larger for long-running orchestrator-workers.)  

2. **Evaluator-optimizer convergence:** How many iterations until evals saturate? When to give up (agent-generated output won't improve further)? No published studies found.  

3. **Supervision overhead in multi-agent systems:** What's the cost of supervisor coordination relative to benefits? At what scale does supervisor become bottleneck? (Anecdotal: Databricks BASF case showed 20–40% overhead; need more data.)  

4. **Prompt brittleness at scale:** 10-line prompt vs. 100-line prompt vs. 500-line prompt—does larger always break first? Or is it nonlinear? No systematic study found.  

5. **Generalization across codebases:** A harness tuned for Repo A with 50 rules—how much transfers to Repo B? Or is every codebase idiosyncratic? (Intuition: ~60% of rules transfer; 40% are repo-specific.)  

6. **Cost of achieving 99.9% reliability vs. 99% vs. 95%:** What's the incremental cost to go from 95% → 99%? Doubling? 5×? Domain-dependent, no universal model.  

7. **Optimal failure mode prioritization:** Which failure modes to tackle first for maximum ROI? (Intuition: Hallucinated tool calls, context exhaustion, goal drift are highest impact; others are nice-to-haves.)  

8. **Interplay between bitter lesson and safety:** Bitter lesson says "scale compute, reduce hand-crafted structure." But safety often requires *more* scaffolding (guardrails, approval gates). How to balance?

---

## Sources

### Core References

- **[anthropic]** [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic's canonical post on workflows vs. agents, 5 workflow patterns, autonomous loop pattern.

- **[anthropic-context-engineering]** [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Context as a budget, rot/decay, compaction, Goldilocks zone for system prompts.

- **[anthropic-advanced-tool-use]** [Introducing Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) — Tool search, programmatic orchestration, tool use examples; token savings & accuracy gains.

- **[anthropic-cache]** [Prompt Caching](https://www.anthropic.com/news/prompt-caching) — 90% input token savings via caching; 75% latency reduction.

- **[humanlayer-12-factor]** [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) — Manifesto for production agent software. All 12 factors with rationale.

- **[addyosmani-harness]** [Agent Harness Engineering](https://addyosmani.com/blog/agent-harness-engineering/) — What's in a harness, good design properties, ratchet principle, "harness > model."

- **[humanlayer-harness]** [Skill Issue: Harness Engineering for Coding Agents](https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents) — Configuration levers, CLAUDE.md guidelines, subagents, hooks, back-pressure.

- **[bitter-lesson]** [The Bitter Lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html) — Rich Sutton's core argument: general methods + compute beat hand-crafted structure.

### Design Patterns

- **[react-pattern]** [ReAct: Synergizing Reasoning and Acting in LMs](https://arxiv.org/abs/2210.03629) — Thought → Action → Observation loop pattern.

- **[llamaindex]** [Agent Workflows: Multi-Step Orchestration](https://www.llamaindex.ai/workflows) — LlamaIndex workflows, planning + reasoning + reflection patterns. 40% → 96% accuracy improvement with structured planning.

- **[databricks-supervisor]** [Supervisor Agent Architecture](https://www.databricks.com/blog/multi-agent-supervisor-architecture-orchestrating-enterprise-ai-scale) — Coordinator pattern, domain specialists, BASF case study.

- **[langgraph]** [LangGraph: Agent Orchestration Framework](https://www.langchain.com/langgraph) — State management, DAGs, checkpointing, human-in-the-loop.

### Tool Use & Structured Outputs

- **[structured-outputs-guide]** [The Guide to Structured Outputs and Function Calling](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms) — Structured outputs vs. function calling; when to use each; strict schema enforcement.

- **[tool-use-standards]** [Tool Use and Function Calling in AI Agents](https://zylos.ai/research/2026-04-07-tool-use-function-calling-standards-benchmarks) — Tool calling standards, benchmarks, emerging patterns. Accuracy gains from examples.

### Failure Modes

- **[microsoft-taxonomy]** [Taxonomy of Failure Modes in Agentic AI Systems](https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/final/en-us/microsoft-brand/documents/Taxonomy-of-Failure-Mode-in-Agentic-AI-Systems-Whitepaper.pdf) — Microsoft whitepaper categorizing agentic failures (14 modes across 3 categories).

- **[nimblebrain-failures]** [AI Agent Failure Modes](https://nimblebrain.ai/why-ai-fails/agent-governance/agent-failure-modes/) — Five predictable failure modes with examples.

- **[wire-blog-drift]** [Agent Drift: Why Long-Running Agents Lose the Plot](https://usewire.io/blog/agent-drift-why-long-running-ai-agents-lose-the-plot/) — Six drift mechanisms (goal, context, role, tool-use, hallucination cascade, plan decay) with mitigations.

- **[goal-drift-eval]** [Evaluating Goal Drift in Language Model Agents](https://arxiv.org/html/2505.02709v1) — Technical report on goal drift measurement and detection.

### Production & Observability

- **[observability-guide]** [AI Agent Observability Guide](https://www.groundcover.com/learn/observability/ai-agent-observability) — Telemetry, traces, metrics, evals. Three-layer eval model.

- **[braintrust-evals]** [Agent Evaluation Framework](https://www.braintrust.dev/articles/ai-agent-evaluation-framework) — Offline vs. online evals; LLM-as-judge; integration with CI/CD.

- **[economics-of-agents]** [The Hidden Economics of AI Agents](https://online.stevens.edu/blog/hidden-economics-ai-agents-token-costs-latency/) — Unreliability tax, token tracking, cost optimization levers.

- **[latency-benchmarks]** [AI Agent Latency in Production](https://arize.com/blog/best-ai-observability-tools-for-autonomous-agents-in-2026/) — Voice agents sub-1000ms; chat acceptable up to 10s; latency trade-offs with quality.

- **[cache-optimization]** [LLM Token Optimization](https://redis.io/blog/llm-token-optimization-speed-up-apps/) — Semantic caching (up to 73% savings), context compression, prompt optimization.

- **[amazon-evals]** [Evaluating AI Agents at Amazon](https://aws.amazon.com/blogs/machine-learning/evaluating-ai-agents-real-world-lessons-from-building-agentic-systems-at-amazon/) — Real-world lessons from Amazon on agent evaluation, metrics, monitoring.

### Related / Referenced

- **[arxiv-coding-agents]** [Building AI Coding Agents for the Terminal](https://arxiv.org/html/2603.05344v1) — OpenDev architecture: scaffolding, harness, context engineering, safety layers.

- **[messaging-reliability]** [Retry, DLQ, and Idempotency in Message Processing](https://bugfree.ai/knowledge-hub/retry-dlq-idempotency-message-processing) — Retries, backoff, dead-letter queues, idempotency patterns.

- **[mcp-docs]** [Connect Claude Code to Tools via MCP](https://code.claude.com/docs/en/mcp) — Model Context Protocol for tool integration, lazy discovery.

- **[generative-ai-collab]** [Towards Effective GenAI Multi-Agent Collaboration](https://arxiv.org/html/2412.05449v1) — Multi-agent design, inter-agent coordination, failure analysis.

---

## Summary: Key Takeaways for Bumblebee Redesign

**Harness > Model.** Invest in scaffolding (CLAUDE.md, hooks, subagents, context compression) before upgrading the LLM.

**Workflows for predictable; agents for open-ended.** Don't make everything agentic. Use orchestrated workflows where outcome space is known.

**Context is a budget.** Track usage real-time. Compress aggressively. Externalize state. Target 60–80% utilization.

**Stateless reducers.** (state, instruction) → (new_state, output). External storage, deterministic, replayable.

**Supervisor + specialists > monolith.** Small focused agents routed by coordinator. Context firewall pattern isolates noise.

**Tools: few, clear, examples.** Lazy-load if needed. Strict schemas. 100% valid JSON enforced.

**Observe from day one.** Traces, evals, cost tracking, latency. Production failures are always weird; without traces, you're blind.

**Failures are design inputs.** Every past failure should have a rule in the harness now.

---

**Compiled by:** Technical Analyst  
**Date:** 2026-05-17  
**Status:** Ready for synthesis into architecture recommendations  
