---
name: task-parallelizer
description: "Review and group tasks into parallel execution batches by analyzing file impact. Invoke with: /task-parallelizer BB-11 BB-12 BB-13 or /task-parallelizer --parent BB-20"
version: 1.0.0
user_invocable: true
arguments: "task_ids... [--parent PARENT_ID]"
---

# Task Parallelizer

Analyze a set of work items, determine which files each will modify, and group them into optimal parallel execution batches to minimize conflicts and maximize throughput.

## Usage

```
/task-parallelizer BB-21 BB-22 BB-23 BB-24 BB-25
/task-parallelizer --parent BB-20
```

## Workflow

### Step 1: Gather tasks

If `--parent` is provided, fetch all children:
```bash
bb item children <PARENT_ID>
```

Otherwise use the task IDs provided as arguments.

### Step 2: Analyze file impact per task

For each task:

1. **Read the task description** via `bb item show <ID>`
2. **Check for suggestion comments** via `bb comment list <ID>` — look for `proposal` type comments that contain "Files to Modify" sections
3. **If no suggestion exists**, analyze the task description to infer which files will be modified based on:
   - Explicit file paths mentioned in description
   - Component/module names that map to known project files
   - The type of change (API endpoint → `api/src/routers/`, React hook → `web/src/hooks/`, page → `web/src/app/`)

4. **Build a file impact map** for each task:
   ```
   BB-21: [web/src/app/projects/[slug]/agent/page.tsx, web/src/hooks/use-websocket.ts]
   BB-22: [web/src/app/projects/[slug]/agent/page.tsx]
   BB-28: [api/src/routers/agent_sessions.py]
   ```

### Step 3: Detect conflicts

Two tasks **conflict** if they modify **any of the same files**. Build a conflict matrix:

```
         BB-21  BB-22  BB-28  BB-25
BB-21      -    CONFLICT  ok     ok
BB-22   CONFLICT   -      ok     ok
BB-28     ok      ok       -     ok
BB-25     ok      ok      ok      -
```

### Step 4: Group into parallel batches

Use a greedy graph coloring algorithm:

1. Sort tasks by number of conflicts (most conflicts first)
2. For each task, assign to the first batch where it has NO conflicts with existing tasks in that batch
3. If no such batch exists, create a new batch

### Step 5: Order batches by dependency

Within each batch, tasks run in parallel. Between batches, run sequentially.
Consider dependencies:
- BE tasks should run before FE tasks that consume their APIs
- Hook/utility tasks before page/component tasks that use them
- New file creation before modifications to existing files

### Step 6: Output the execution plan

Present results in this format:

```
## Task Parallelization Analysis

### File Impact Map

| Task | Files Modified | Layer |
|------|---------------|-------|
| BB-28 | api/src/routers/agent_sessions.py | BE |
| BB-29 | api/src/routers/work_items.py, api/src/schemas/work_item.py | BE |
| BB-21 | web/src/app/.../agent/page.tsx | FE |
| BB-22 | web/src/app/.../agent/page.tsx | FE |

### Conflict Matrix

BB-21 <-> BB-22 (both modify agent/page.tsx)
BB-28 <-> BB-30 (both modify agent_sessions.py)

### Execution Plan

**Batch 1** (parallel — no conflicts):
```bash
bb agent batch-run BB-28 BB-29 BB-25 BB-31 BB-32 --auto-merge --target release/dev
```

**Batch 2** (sequential — conflict on agent/page.tsx):
```bash
bb agent run BB-21 --target release/dev
bb agent run BB-22 --target release/dev
bb agent run BB-24 --target release/dev
```

**Batch 3** (sequential — depends on Batch 1):
```bash
bb agent run BB-30 --target release/dev
```

### Summary
- Total tasks: 12
- Parallel batches: 3
- Max parallelism: 5 (Batch 1)
- Estimated speedup: ~2.5x vs fully sequential
```

## File Path Inference Rules

When suggestion comments are not available, use these heuristics to infer file impact:

| Description keyword | Likely files |
|---------------------|-------------|
| "API endpoint", "router" | `api/src/routers/*.py` |
| "model", "schema", "migration" | `api/src/models/*.py`, `api/src/schemas/*.py` |
| "hook", "useXxx" | `web/src/hooks/use-*.ts` |
| "page", "route" | `web/src/app/**/*.tsx` |
| "component", "detail", "panel" | `web/src/components/**/*.tsx` |
| "WebSocket", "ws" | `api/src/websocket/`, `web/src/lib/websocket.ts` |
| "CLI", "command" | `cli/bb_cli/commands/*.py` |
| "filter", "filter bar" | `web/src/components/**/filter-bar.tsx` |
| "kanban", "card" | `web/src/components/**/kanban-board.tsx`, `work-item-card.tsx` |
| "list", "row", "hierarchy" | `web/src/components/**/hierarchy-list.tsx`, `work-item-row.tsx` |
| "detail panel" | `web/src/components/**/detail-panel.tsx` |
| "detail page" | `web/src/components/**/detail-page.tsx` |
| "create modal" | `web/src/components/**/create-item-modal.tsx` |

## Important Notes

- **suggest is always safe to parallelize** — it only reads code and posts comments
- **execute/run modify files** — only parallelize when file impact doesn't overlap
- When uncertain about file impact, **assume conflict** and put tasks in sequential order
- After batch-run, check for merge conflicts: `git log --oneline release/dev..HEAD`
- If a task creates NEW files only (no modifications), it's safe to parallelize with anything
