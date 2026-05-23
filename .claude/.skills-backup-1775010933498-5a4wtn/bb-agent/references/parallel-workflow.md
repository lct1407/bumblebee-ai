# Parallel Development Workflow

Guide for splitting work items across packages and running agents in parallel.

## When to Use

Use parallel mode when a work item:
- Affects 2+ packages (api/, web/, cli/)
- Has clearly separable scopes of work
- Benefits from independent implementation and testing

Do NOT split items that:
- Have tight cross-package dependencies requiring coordinated changes
- Are small enough to implement in a single pass
- Only affect one package

## Split Analysis Format

The suggest phase outputs a SPLIT_RESULT block:

```
### SPLIT_RESULT
NEEDS_SPLIT: true
ITEMS:
- SCOPE: api
  TITLE: API - add auth endpoints
  DESCRIPTION: Create POST /api/auth/login and /api/auth/register
  ACCEPTANCE_CRITERIA: Endpoints return JWT tokens, tests pass
- SCOPE: web
  TITLE: Web - login page
  DESCRIPTION: Create login form with email/password
  ACCEPTANCE_CRITERIA: Form submits to API, redirects on success
```

## Commands

### Manual Flow (step-by-step)

```bash
# 1. Analyze and propose split
bb agent suggest BB-42

# 2. Create sub-items from proposal
bb agent split BB-42

# 3. Run sub-items in parallel (each gets own worktree)
bb agent batch-run BB-43 BB-44 BB-45

# 4. Integration test + merge all
bb agent integrate BB-42 --target release/dev --cleanup
```

### Autonomous Flow (single command)

```bash
bb agent run BB-42 --auto-split --target release/dev
```

This runs: suggest → split → batch-run children → integrate.
Use `--no-auto-split` to disable and use the single-item flow.

## Batch-Run Behavior

`bb agent batch-run` runs items in parallel:

1. Each item gets its own git worktree under `~/.bumblebee/worktrees/{slug}/`
2. Each worktree has its own branch: `{prefix}/{key}_{slug}`
3. Claude Code runs in `--permission-mode bypassPermissions`
4. Max parallelism controlled by `--parallel N` (default: 2)
5. After execution: Docker tests per item
6. Passing items can auto-merge with `--auto-merge`

## Integrate Flow

`bb agent integrate` merges all child branches:

1. Validates all children are resolved/in_review
2. Creates temp branch: `integrate/{parent-key}`
3. Merges each child branch sequentially
4. Runs Docker tests on the integration branch
5. On pass: fast-forward target, mark parent resolved, cleanup
6. On fail: abort, post failure report, cleanup integration branch

### Conflict Handling

If a child branch has merge conflicts during integration:
- The integration aborts immediately
- A failure comment is posted on the parent item
- Manual conflict resolution is needed before re-running

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Child execution fails | Continues other children, reports failure |
| Docker test fails | Triggers reimplement retry (up to 3x) |
| Merge conflict | Aborts integration, posts conflict details |
| All retries exhausted | Parent marked `failed`, manual fix needed |

## MCP Tools

For programmatic access (Claude Code agents):

- `bumblebee_split_item(parent_item_id, sub_items, project_slug)` — create children from JSON
- `bumblebee_create_items(project_slug, items)` — batch create with auto-type detection
