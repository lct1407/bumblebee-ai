---
name: subagent-driven-development
description: |
  Break complex implementations into subagent-dispatched tasks using Claude Code's Task tool.
  Use when a single work item requires changes across multiple packages (api/, web/, cli/) or
  when parallel independent tasks can speed up delivery. Complements bb agent workflow.
version: 1.0.0
---

# Subagent-Driven Development

Decompose complex work into discrete tasks, dispatch a fresh subagent per task via Claude Code's
Task tool, and enforce code review between tasks.

Core principle: **Fresh subagent per task + review between tasks = high quality, fast iteration.**

## When to Use This vs `bb agent`

| Approach | Use When |
|----------|----------|
| `bb agent run <id>` | Full autonomous pipeline for a single work item (suggest, execute, test, merge) |
| `bb agent batch-run` | Multiple independent work items, each gets its own pipeline |
| **This skill** | A single complex implementation needing decomposition within one Claude Code session |

**Good fit:** work item spans `api/` + `web/`, feature touches 3+ packages, refactor with 5+
reviewable steps, you want review checkpoints between phases rather than only at the end.

## Execution Modes

### Sequential

Tasks are coupled. Execute in order, review after each.

```
Task 1 (migration) --> Review --> Task 2 (API) --> Review --> Task 3 (UI) --> Final Review
```

Use when later tasks depend on earlier output (e.g., API schema drives frontend types).

### Parallel

Tasks are independent. Dispatch all at once, review after batch.

```
Task 1 (API) ───┐
Task 2 (Web) ───┼──> Review all --> Fix issues --> Final Review
Task 3 (CLI) ───┘
```

Use when tasks modify different packages or files with zero overlap.

## Process

### Step 1: Plan and Track

Read work item (via `bb item show` or MCP), decompose into tasks, create TodoWrite checklist.

### Step 2: Dispatch Subagents

Use the Task tool to spawn a fresh subagent per task with a focused, bounded prompt.

**Sequential example:**

```
Task tool (general-purpose):
  description: "Implement: Work item relations API endpoint"
  prompt: |
    You are implementing Task 2 of 4 for BB-42.
    Package: api/
    Task: Add GET/POST /api/work-items/{id}/relations
    Constraints:
    - Follow patterns in api/src/routers/
    - SQLAlchemy 2.0 async, Pydantic v2 schemas
    - Only modify files under api/
    When done: report files changed, what was implemented, any concerns.
```

**Parallel example (multi-package):**

Dispatch simultaneously when independent:

```
# Subagent 1: API
Task tool (general-purpose):
  description: "Implement: Labels CRUD API"
  prompt: "Implement GET/POST/PUT/DELETE /api/projects/{slug}/labels.
           Follow api/src/routers/ patterns. Only modify files under api/."

# Subagent 2: Web
Task tool (general-purpose):
  description: "Implement: Label management page"
  prompt: "Create label management at web/src/app/projects/[slug]/labels/.
           Use shadcn/ui. Only modify files under web/."

# Subagent 3: CLI
Task tool (general-purpose):
  description: "Implement: bb label commands"
  prompt: "Add bb label list/create/update/delete.
           Follow cli/src/commands/ patterns. Only modify files under cli/."
```

### Step 3: Review

After each task (sequential) or batch (parallel), dispatch a code-reviewer subagent.

```
Task tool (code-reviewer):
  description: "Review: Task 2 API implementation"
  prompt: |
    Review changes for Task 2. Run: git diff HEAD~1
    Check: correctness, type safety, error handling, codebase consistency, security.
    Categorize as: Critical / High / Medium / Low
    Report with specific file:line references.
```

### Step 4: Fix Issues

If Critical or High issues found, dispatch a fix subagent:

```
Task tool (general-purpose):
  description: "Fix: Review findings for Task 2"
  prompt: "Fix these issues: [paste findings]. Only modify flagged files."
```

### Step 5: Mark Complete, Next Task

Update TodoWrite. Sequential: proceed to next task. Parallel: move to final review.

### Step 6: Final Review

After all tasks, holistic cross-package review:

```
Task tool (code-reviewer):
  description: "Final review: All changes for BB-42"
  prompt: |
    Review ALL session changes. Run: git diff main...HEAD
    Verify: requirements met, API schemas match frontend types,
    no dead code, builds pass (pytest + npm run build).
```

## Red Flags

1. **Never skip code review between tasks.** Checkpoints catch issues before they compound.

2. **Do not proceed with unfixed Critical issues.** Security holes, data loss risks, and
   breaking changes must be resolved before the next task.

3. **Do not dispatch parallel subagents that modify the same files.** Causes merge conflicts
   and lost work. Same-file tasks must run sequentially.

4. **Keep subagent scope narrow.** One task = one clear deliverable. Broad prompts produce
   lower quality output.

5. **Always specify the package boundary** in prompts (`Only modify files under api/`).
   Without this, subagents may make conflicting cross-package changes.

## Integration with `bb agent`

This skill operates within a Claude Code session. It does not replace `bb agent run`.

Typical combined workflow:

1. `bb agent suggest BB-42` -- generates the plan
2. User reviews and approves
3. During execution, use **this skill** to decompose: dispatch subagents per package, review between each
4. `bb agent test BB-42` -- verification
5. `bb agent merge` -- merge result

For simpler items that fit in a single pass, use `bb agent run` directly.

## Quick Reference

| Action | Tool | Agent Type |
|--------|------|------------|
| Implement a task | Task tool | `general-purpose` |
| Review changes | Task tool | `code-reviewer` |
| Fix review findings | Task tool | `general-purpose` |
| Track progress | TodoWrite | -- |
| Read work item | `bb item show` or MCP | -- |
| Run tests | Bash (`pytest`, `npm test`) | -- |
