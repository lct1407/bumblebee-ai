# jarvis-agents Architecture Analysis

Source: D:\Source\jarvis-agents (reference project, read-only).

## Stack
- Strapi 5 (backend) + Next.js (web) + Tauri (desktop) + RN/Expo (mobile).
- RunnerAdapters: Desktop (Claude CLI subprocess), Antigravity (cloud), LiteLLM (proxy any provider).
- Skill chain: forge-triage → forge-plan → forge-code → forge-review → forge-test → forge-fix → forge-release.

## What to TAKE

### 1. Workflow-as-data
- `PipelineTemplate` rows define phase sequences.
- `StatusFlowRule` rows define transitions and triggered runners.
- Editing a workflow = updating a row, not redeploying.
- **Adopt:** YAML files (simpler than DB rows; git-versioned; diff-friendly).

### 2. RunnerAdapter pattern
- Single interface, multiple runtimes (CLI, cloud, proxy).
- Each phase declares its preferred runtime; routing is config.
- **Adopt:** Go `Runner` interface + 3 implementations.

### 3. Session continuity
- Each phase writes a context summary; next phase reads it.
- Avoids losing state across the suggest→execute→test chain.
- **Adopt:** `task_session_context` JSONB column updated on phase complete.

### 4. Dual-branch staging/prod model
- `release/dev` for staging deploys, `master` for production.
- Human gate at `staging` for Complex items.
- **Adopt:** keep two-branch flow; add merge gate at `review`.

### 5. Knowledge dual-track
- `.forge/knowledge.json` (local, fast) + `docs/knowledge/` (central, durable).
- File-size limits (500/300 lines) prevent context bloat.
- **Adopt:** filesystem only (no JSON cache initially); enforce 200-line target.

## What to SKIP

### 1. 15-status lifecycle
- Status set: triaged, planned, approved, blocked, in_progress, in_review, developed, deploying, testing, staging, released, closed, failed, reopen, on_hold + side states.
- Too many edges; transition matrix is ~50+ rules.
- **Reject:** collapse to 8 statuses + 3 side states.

### 2. Pikachu shadow evaluator
- Secondary agent re-runs results to grade them.
- Toy-tier; doubles cost; no measurable accuracy gain.
- **Reject:** rely on test runner + human review gate.

### 3. Four-client surface
- Web + Desktop + Mobile + CLI = 4 packages to keep in sync.
- Mobile especially is dead weight for a dev tool.
- **Reject:** Web + CLI only. Desktop deferred to v3.2.

### 4. Per-project FIFO concurrency=1
- Bottleneck for any team larger than one developer.
- **Reject:** worktree-per-session, semaphore at machine level only.

### 5. Complexity routing baked into status machine
- Simple/Medium/Complex drive different status paths (auto-skip vs human gate).
- Adds branching at every transition.
- **Reject:** single linear flow, gate is workflow-config not status-machine.

## Adopt summary

| Pattern | Adopt | Form |
|---|---|---|
| Workflow-as-data | Yes | YAML files in `.bumblebee/workflows/` |
| RunnerAdapter | Yes | Go `Runner` interface |
| Session continuity | Yes | `task_session_context` JSONB |
| Two-branch flow | Yes | release/dev + master |
| Dual-track knowledge | Partial | filesystem only |
| 15 statuses | No | 8 statuses |
| Pikachu evaluator | No | drop |
| 4 clients | No | Web + CLI |
| FIFO concurrency=1 | No | semaphore N |
| Complexity branching | No | linear flow |
