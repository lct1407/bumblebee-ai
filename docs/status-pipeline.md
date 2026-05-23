# Work Item Status Pipeline

## Statuses (19)

| # | Status | Meaning | Trigger |
|---|--------|---------|---------|
| 1 | `new` | New, untriaged | Item created |
| 2 | `triaged` | Triaged, needs plan | triage phase |
| 3 | `planned` | Plan written, awaiting approval (Complex) or auto-approved (Simple/Medium) | analyze phase |
| 4 | `approved` | Planned, ready to code | Human (Complex) or auto-approve (Simple/Medium) |
| 5 | `in_progress` | Being coded | implement phase start |
| 6 | `in_review` | Code done, awaiting test | implement phase complete |
| 7 | `developed` | Code pushed, awaiting independent review (Complex only) | complexity routing |
| 8 | `deploying` | Merging to release/dev + Coolify deploy | review pass or test pass |
| 9 | `testing` | QA against staging | Deploy success |
| 10 | `staging` | Human final check (Complex) or auto-skipped (Simple/Medium) | QA pass |
| 11 | `released` | Approved for prod, triggers squash merge + deploy | Human confirms staging |
| 12 | `done` | Complete (legacy terminal) | merge phase (backward compat) |
| 13 | `closed` | Archived | release phase complete |
| 14 | `failed` | Implementation failed | test fail or implement fail |
| 15 | `reopen` | Rejected at review/test/staging, needs fix | Review REQUEST_CHANGES |
| 16 | `on_hold` | Infra failure or manual pause | Server deploy fail / manual |
| 17 | `wont_fix` | Will not fix | Manual |
| 18 | `needs_info` | Blocked on clarification | Triage or manual |
| 19 | `blocked` | Blocked by dependency | Manual |

### Legacy Aliases (backward compat)

| Old | Maps To |
|-----|---------|
| `open` | `new` |
| `confirmed` | `triaged` |
| `awaiting_review` | `planned` |
| `backlog` | `new` |
| `todo` | `triaged` |
| `resolved` | `done` |
| `cancelled` | `wont_fix` |

## Complexity Classification

Each work item has a `complexity` field set during triage: `Simple`, `Medium`, or `Complex`.

| Criteria | Simple | Medium | Complex |
|----------|--------|--------|---------|
| Files affected | 1 file | 2-5 files, same module | 6+ files, cross-module |
| Schema changes | No | No | Yes |
| Security implications | No | Low | Yes |

Complexity drives pipeline routing — see [Routing Rules](#routing-rules).

## Pipeline Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │              HAPPY PATH                      │
  ┌─────┐  triage  ┌────────┐  analyze  ┌────────┐  human  ┌────────┐│
  │ new │────────▶│ triaged │────────▶│ planned │───────▶│approved││
  └─────┘          └────────┘          │(Complex)│        └───┬────┘│
                                        └────────┘            │     │
                              Simple/Medium: auto-approve ────┘     │
                                                                    │
                                          implement                 │
                                              │                     │
                                     ┌────────▼────────┐            │
                                     │  in_progress     │            │
                                     │ 1. implement     │            │
                                     │ 2. self/quick    │            │
                                     │    review        │            │
                                     │ 3. commit+push   │            │
                                     └────────┬────────┘            │
                                              │                     │
                               ┌──────────────┼──────────────┐      │
                               │              │              │      │
                         Complex         Simple/Med                 │
                               │              │                     │
                        ┌──────▼──────┐       │                     │
                        │  developed  │       │                     │
                        └──────┬──────┘       │                     │
                               │              │                     │
                         review agent         │                     │
                               │              │                     │
                        ┌──────┴──────┐       │                     │
                     pass          fail       │                     │
                        │             │       │                     │
                        │      ┌──────▼──┐    │                     │
                        │      │ reopen  │    │                     │
                        │      └─────────┘    │                     │
                        │                     │                     │
                 ┌──────▼──────┐              │                     │
                 │  deploying  │◀─────────────┘                     │
                 └──────┬──────┘                                    │
                        │                                           │
                   deploy success / CI fail                         │
                        │                                           │
                 ┌──────▼──────┐                                    │
                 │   testing   │  (QA against staging)              │
                 └──────┬──────┘                                    │
                        │                                           │
                   qa pass / fail                                   │
                        │                                           │
                 ┌──────▼──────┐                                    │
                 │   staging   │  (Complex: human gate)             │
                 └──────┬──────┘  (Simple/Med: auto-skip)          │
                        │                                           │
                 ┌──────▼──────┐                                    │
                 │  released   │                                    │
                 └──────┬──────┘                                    │
                        │                                           │
                   squash merge → master → Coolify deploy           │
                        │                                           │
                 ┌──────▼──────┐                                    │
                 │   closed    │                                    │
                 └─────────────┘                                    │
                                                                    │
  EXCEPTIONS (from any active state):                               │
  ┌──────────┐  ┌────────────┐  ┌─────────┐                        │
  │ on_hold  │  │ needs_info │  │ blocked │                        │
  └──────────┘  └────────────┘  └─────────┘                        │
```

## Pipeline Steps

1. **new** → triage → **triaged** (or **needs_info**)
2. **triaged** → analyze → **planned**
3. **planned** → auto-approve (Simple/Medium) or human approve (Complex) → **approved**
4. **approved** → implement → **in_progress** → **in_review**
5. **in_review** → Complex: route to **developed** / Simple/Med: route to **deploying**
6. **developed** → review agent → **deploying** (APPROVE) or **reopen** (REQUEST_CHANGES)
7. **deploying** → deploy success → **testing**
8. **testing** → qa_test → **staging** (pass) or **reopen** (fail)
9. **staging** → auto-skip (Simple/Med) or human approve (Complex) → **released**
10. **released** → release → squash merge to master → Coolify deploy → **closed**

**Rejection** → **reopen** → fix phase → back to **in_progress** (max 5 cycles)

## Routing Rules

| Aspect | Simple | Medium | Complex |
|--------|--------|--------|---------|
| Plan approval | Auto-approve | Auto-approve | Human gate at `planned` |
| Code review | Self-review (in implement) | Quick review (bug-severity) | Full independent review agent |
| Deploy path | `in_review` → `deploying` direct | `in_review` → `deploying` direct | `in_review` → `developed` → review → `deploying` |
| Staging gate | Auto-skip | Auto-skip | Human approval required |

## Branching Model

Two branches serve different environments:
- **release/dev** — staging/testing. Feature branches merge here for QA.
- **master** — production. Only release phase squash-merges here.

```
feat/bb-42 ──merge──▶ release/dev (staging) ──▶ staging env for QA
                │
                └─── at released ──squash merge──▶ master (production)
```

Feature branch kept alive through entire pipeline. Squash-merged to master independently at release.

## What Happens Inside `in_progress`

The implement phase handles the full local development cycle:

```
in_progress:
  1. Implement changes (follow plan)
  2. Run build — catch compile/type errors
  3. Code review (tiered by complexity):
     - Simple: self-review (read diff)
     - Medium: quick review agent (bug-severity only)
     - Complex: full review inside implement
  4. Commit + push to feature branch
  5. Status → in_review
```

## Deploy Failure Handling

| Failure | Cause | Status | Handler |
|---------|-------|--------|---------|
| CI pipeline failed | Code doesn't build | `reopen` | fix phase |
| Server deploy failed | Infra issue | `on_hold` | Human/ops |
| Deploy stuck >15min | Unknown hang | `on_hold` | Human/ops |

```
deploying → CI fails → reopen → fix phase → in_progress → deploying (retry)
deploying → server fail → auto-retry (1-2x) → still fails → on_hold
```

## Pipeline Orchestrator

Located at `api/src/services/pipeline_orchestrator.py`. Watches work item status changes and dispatches agent phases.

### Skill Mapping

```
Status        → Agent Phase    → Config Toggle
───────────────────────────────────────────────
new           → triage         → auto_triage
triaged       → analyze        → auto_analyze
planned       → (auto-approve) → (complexity routing)
approved      → implement      → auto_implement
in_review     → test           → auto_test
developed     → review         → auto_review
deploying     → deploy         → auto_deploy
testing       → qa_test        → auto_qa
staging       → (human gate)   → (auto-skip for Simple/Med)
released      → release        → auto_release
failed        → reimplement    → auto_reimplement
reopen        → fix            → auto_fix
```

Human-gated statuses (`planned` for Complex, `staging` for Complex) never auto-trigger.

### Queue Management

- Dequeue via `POST /api/queue/dequeue` (PostgreSQL SKIP LOCKED)
- Deduplication: skip if same item+phase queued in last 2 min
- Semaphore-based concurrency limit per worker device

### Session Continuity

Work items have `session_context` JSONB for cross-phase context persistence:
- On session complete: API saves context summary (phase, decisions, files, errors)
- On next phase start: CLI injects previous context into prompt preamble

### Reopen Cycle Protection

Tracks `reopen → fix` cycles per item. After 5 cycles, auto-fix stops. Manual triggers bypass limit.

### Child/Parent Cascade

- Approved parent → auto-trigger children pipeline
- Children at `planned` → auto-promote to `approved` (inherit parent approval)
- ALL children done → parent auto-advances to `in_review`

## Project Pipeline Configuration

Opt-in per project via `projects.pipeline_config` (JSONB):

```json
{
  "enabled": true,
  "auto_triage": true,
  "auto_analyze": true,
  "auto_implement": false,
  "auto_test": true,
  "auto_reimplement": { "enabled": true, "max_retries": 3 },
  "auto_review": true,
  "auto_fix": { "enabled": true, "max_cycles": 5 },
  "auto_deploy": true,
  "auto_qa": true,
  "auto_release": false,
  "deploy_config": {
    "coolify_url": "https://manage.example.com",
    "coolify_api_key": "***",
    "resources": [
      { "name": "api", "uuid": "abc123" },
      { "name": "web", "uuid": "def456" }
    ],
    "staging_url": "https://staging.example.com",
    "staging_api_url": "https://staging-api.example.com"
  }
}
```

Each toggle supports boolean or object form: `true` or `{ "enabled": true, "runner": "cli", "model": "..." }`.

### Behavior

- `enabled: false` (default) — no automation
- `enabled: true` — orchestrator watches status changes
- Individual steps toggled independently
- Manual triggers via `POST /api/agent-sessions/pipeline/trigger/{item_id}` bypass toggles

## Pipeline Skills Summary

| Skill | Status Trigger | Exit Status | What It Does |
|-------|---------------|-------------|-------------|
| **triage** | `new` | `triaged` / `needs_info` | Classify complexity, enrich description, set priority |
| **analyze** | `triaged` | `planned` | Explore codebase, write implementation plan |
| **implement** | `approved` | `in_review` | Create worktree, implement, commit, push |
| **test** | `in_review` | `done` / `failed` | Run tests in worktree |
| **reimplement** | `failed` | `in_progress` | Re-implement using failure feedback |
| **review** | `developed` | `deploying` / `reopen` | Independent code review (Complex) |
| **fix** | `reopen` | `in_progress` | Fix review-rejected code |
| **deploy** | `deploying` | `testing` | Merge to release/dev, trigger Coolify |
| **qa_test** | `testing` | `staging` / `reopen` | QA against staging |
| **release** | `released` | `closed` | Squash merge to master, prod deploy |
| **merge** | `in_review` | `done` | Legacy: direct merge without deploy pipeline |

## Evidence Gates

Certain transitions require a comment of a specific type:

| Transition | Required Comment Type |
|---|---|
| `new` → `triaged` | `"triage"` |
| `triaged` → `planned` | `"proposal"` or `"analysis"` |
| `in_progress` → `in_review` | `"agent_output"` or `"review"` |
| `developed` → `deploying` | `"review"` or `"approval"` |

Evidence gates are enforced for agent-driven transitions only. Manual UI updates bypass them.

## CLI Commands

```
bb agent triage <id>          # Phase: triage
bb agent analyze <id>         # Phase: analyze
bb agent suggest <id>         # Alias: triage + analyze
bb agent execute <id>         # Phase: implement
bb agent test <id>            # Phase: test
bb agent reimplement <id>     # Phase: reimplement
bb agent review <id>          # Phase: review (Complex)
bb agent fix <id>             # Phase: fix (reopen cycle)
bb agent deploy <id>          # Phase: deploy
bb agent release <id>         # Phase: release
bb agent run <id>             # Full loop: verify → execute → test → merge
bb agent merge                # Legacy: merge worktree to target
```
