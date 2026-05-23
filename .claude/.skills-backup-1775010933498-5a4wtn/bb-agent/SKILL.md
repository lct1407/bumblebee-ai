---
name: bb-agent
description: |
  Resolve work items or investigate problems using Bumblebee MCP tools + bb CLI.
  Modes: (1) Action — verb + item IDs for specific phases (suggest, implement, split, run, test).
  (2) Resolve — item IDs only → full lifecycle. (3) Investigate — free text → root cause analysis.
  Auto-detects mode from arguments.
  Invoke with: /bb-agent suggest BB-42 or /bb-agent BB-42 or /bb-agent login page returns 500
version: 4.0.0
user_invocable: true
arguments: "[action] work-item-IDs or free-text problem description"
---

# Bumblebee Agent

Combined skill for resolving work items and investigating problems.

**Data operations** use MCP tools (`bumblebee_work_items`, `bumblebee_comments`, `bumblebee_projects`).
**Agent orchestration** uses the `bb agent` CLI commands (suggest, execute, test, run, merge).

## Usage

```
/bb-agent suggest BB-42                      ← action mode: analyze + propose solution
/bb-agent implement BB-42                    ← action mode: implement + test + resolve
/bb-agent split BB-42                        ← action mode: create sub-items from proposal
/bb-agent run BB-42                          ← action mode: full auto-split autonomous run
/bb-agent test BB-42                         ← action mode: run tests in worktree
/bb-agent reimplement BB-42                  ← action mode: retry failed implementation
/bb-agent continue BB-42                     ← action mode: resume incomplete work
/bb-agent integrate BB-42                    ← action mode: merge children + docker test
/bb-agent BB-42                              ← resolve mode: smart triage → best action
/bb-agent BB-42 BB-43                        ← resolve multiple items
/bb-agent login page returns 500             ← investigate mode (free text)
/bb-agent create: build auth system          ← create mode: create items from description
```

## Mode Detection

Parse arguments left-to-right:

1. **Action mode**: First token matches an action keyword → run that specific phase on the remaining item IDs
2. **Create mode**: Arguments start with `create:` → create items from the description text
3. **Resolve mode**: ALL tokens match work item ID regex → smart triage (see below)
4. **Investigate mode**: Any token is free text → investigation workflow

**Action keywords**: `suggest`, `implement`, `split`, `run`, `test`, `reimplement`, `continue`, `integrate`
**Item ID regex**: `^([A-Z]+-\d+|\d+|[0-9a-f-]{36})$`

## Action Mode

Each action maps to a specific phase. Always **fetch the item first** before any action.

### `suggest` — Analyze + Propose Solution

Analyze the work item and post a proposal comment with implementation plan + split analysis.

1. Fetch item + comments via MCP
2. Read knowledge base (CLAUDE.md, docs/knowledge.md)
3. Run `bb agent suggest <id_or_number>` from CLI
4. The suggest phase posts a `type: "proposal"` comment with:
   - Analysis of the problem
   - Implementation plan
   - SPLIT_RESULT block (if item spans multiple packages)
5. Report the proposal summary to the user

### `implement` — Implement + Test + Resolve

Execute the full implementation lifecycle (same as Resolve mode):

Follow `references/workflow.md` steps 1–14:
Fetch → Triage → Knowledge → Branch → Status → Plan/Execute → Implement → Test → Self-review → Code simplify → Commit → Test gate → Comment → Resolve

### `split` — Create Sub-Items from Proposal

Parse the latest proposal comment and create child work items.

1. Fetch item + comments
2. Run `bb agent split <id_or_number>` from CLI
3. This parses the SPLIT_RESULT block from the latest proposal comment
4. Creates child items with `parent_id` set to the parent
5. Report created children to the user

### `run` — Full Autonomous Flow

Run the complete agent pipeline including auto-split if needed.

1. Run `bb agent run <id_or_number> --auto-split --target release/dev`
2. Pipeline: suggest → (split → batch-run children → integrate) or (execute → test → merge)
3. See `references/parallel-workflow.md` for details

### `test` — Run Tests in Worktree

Run tests for an item that's already been implemented in a worktree.

1. Run `bb agent test <id_or_number>` from CLI
2. Posts test report comment on the item

### `reimplement` — Retry Failed Implementation

Re-implement a failed item using feedback from previous attempt.

1. Fetch item + comments (reads previous plan + execution report + test failures)
2. Run `bb agent reimplement <id_or_number>` from CLI
3. Uses previous feedback to avoid repeating the same mistakes

### `continue` — Resume Incomplete Work

Continue work on an item that was started but not finished.

1. Run `bb agent continue <id_or_number>` from CLI
2. Reads previous comments to understand where work left off

### `integrate` — Merge Children + Docker Test

Merge all child branches and run integration tests.

1. Run `bb agent integrate <id_or_number> --target release/dev` from CLI
2. See `references/parallel-workflow.md` for the full integrate flow

## Resolve Mode (Smart Triage)

When only item IDs are provided without an action keyword, **smart triage** determines the best action based on item status:

| Item Status | Auto Action | Rationale |
|---|---|---|
| `open`, `confirmed`, `approved` | **suggest** | Item needs analysis first |
| `in_progress` | **continue** | Work already started, resume it |
| `failed` | **reimplement** | Previous attempt failed, retry with feedback |
| `in_review`, `resolved` | **skip** | Already done, report status |
| `needs_info` | **skip** | Missing info, ask user to clarify |
| `backlog`, `todo` | **suggest** | Needs analysis before work |

For multiple items: triage each independently, report plan, then execute sequentially or in parallel.

## Investigate Mode

Follow the investigation process in `references/investigate-workflow.md`:

1. **Understand** — parse problem description (what, where, when)
2. **Check duplicates** — `bumblebee_work_items(action="list", project_slug="...", data='{"status":"open"}')`, search for related items
3. **Reproduce** — attempt to reproduce the issue
4. **Trace root cause** — follow error through architecture layers
5. **Assess impact** — determine priority based on severity
6. **Create items** — `bumblebee_work_items(action="create", project_slug="...", data='{"title":"...","type":"bug","priority":"high"}')`
7. **Add details** — post investigation comment with root cause, steps, suggested fix
8. **Create sub-tasks** — break complex fixes into child items
9. **Summarize** — present findings and created items to user

## Create Mode

Arguments start with `create:` followed by a description:
- `/bb-agent create: build notification system` → creates items
- Type auto-detected: large scope → epic + children, small → task
- Uses `bumblebee_create_items` or `bumblebee_work_items(create)` MCP tools

## MCP Tools & CLI Reference

See `references/bb-commands.md` for the full reference.

## Key Rules

1. **Always fetch data first** — never assume data from the prompt
2. **Triage before working** — if lacking detail, ask for clarification and stop
3. **Check for duplicates** — search existing items before creating new ones
4. **One item per root cause** — don't create multiple items for symptoms
5. **Stay on your branch** — never switch branches mid-work
6. **Run tests** after implementation
7. **Self-review** all changes before finishing
8. **Post comments** summarizing changes or findings
9. **Follow existing patterns** — read CLAUDE.md and match conventions

## References

- `references/workflow.md` — resolve lifecycle (step-by-step)
- `references/investigate-workflow.md` — investigation process
- `references/bb-commands.md` — MCP tools + CLI command quick reference
- `references/prompts.md` — prompt templates for each phase
- `references/status-transitions.md` — valid status flows per type
- `references/parallel-workflow.md` — parallel split/integrate workflow
