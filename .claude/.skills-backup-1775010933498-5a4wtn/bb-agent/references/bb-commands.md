# Bumblebee Quick Reference

Data operations use **MCP tools**. Agent orchestration uses **`bb agent` CLI commands**.

## MCP Tools — Data Operations

### Projects

```
# List all projects
bumblebee_projects(action="list")

# Get project details
bumblebee_projects(action="get", project_slug="my-project")

# Create project
bumblebee_projects(action="create", data='{"name":"My Project","slug":"my-project","key":"MP"}')
```

### Work Items

```
# List items (with optional filters)
bumblebee_work_items(action="list", project_slug="my-project")
bumblebee_work_items(action="list", project_slug="my-project", data='{"status":"open"}')
bumblebee_work_items(action="list", project_slug="my-project", data='{"type":"bug"}')
bumblebee_work_items(action="list", project_slug="my-project", data='{"type":"task","status":"open"}')
bumblebee_work_items(action="list", project_slug="my-project", data='{"assignee":"thanhlc"}')

# Get item details
bumblebee_work_items(action="get", item_id="42")

# Create item
bumblebee_work_items(action="create", project_slug="my-project", data='{"title":"Fix 500 error on tree endpoint","type":"bug","priority":"high"}')
bumblebee_work_items(action="create", project_slug="my-project", data='{"title":"Add pagination to items list","type":"task","priority":"medium"}')
bumblebee_work_items(action="create", project_slug="my-project", data='{"title":"Fix schema validation","type":"task","parent_id":10}')

# Update item
bumblebee_work_items(action="update", item_id="42", data='{"status":"in_progress"}')
bumblebee_work_items(action="update", item_id="42", data='{"priority":"critical"}')
bumblebee_work_items(action="update", item_id="42", data='{"assignee":"thanhlc"}')
bumblebee_work_items(action="update", item_id="42", data='{"status":"in_review"}')
```

### Comments

```
# List comments
bumblebee_comments(action="list", work_item_id="42")

# Create comment
bumblebee_comments(action="create", work_item_id="42", data='{"body":"Investigation findings: ...","type":"discussion"}')
bumblebee_comments(action="create", work_item_id="42", data='{"body":"## Proposed Fix\\n...","type":"proposal"}')
bumblebee_comments(action="create", work_item_id="42", data='{"body":"## Changes Made\\n...","type":"agent_output"}')
bumblebee_comments(action="create", work_item_id="42", data='{"body":"<test report>","type":"test_report"}')
```

### Sprints

```
# List sprints
bumblebee_sprints(action="list", project_slug="my-project")

# Get sprint
bumblebee_sprints(action="get", sprint_id="1")

# Create sprint
bumblebee_sprints(action="create", project_slug="my-project", data='{"name":"Sprint 1","goal":"MVP features"}')
```

## CLI Commands — Agent Orchestration

These commands manage the agent lifecycle (worktrees, Claude CLI spawning, merge). Keep using `bb agent` for these:

```bash
# Suggest a plan (analysis only, no code changes)
bb agent suggest BB-42

# Full run: verify → execute → test → retry → merge
bb agent run BB-42 --auto-merge --target release/dev

# Skip verification, go straight to execute
bb agent run BB-42 --skip-verify -y

# Test in worktree
bb agent test BB-42

# Re-implement after failure
bb agent reimplement BB-42

# Continue incomplete work
bb agent continue BB-42

# Merge completed work
bb agent merge --target release/dev

# Clean up worktree
bb agent cleanup 42

# List active worktrees
bb agent worktrees
```

## CLI Commands — Board View

```bash
bb board                    # all types
bb board --type story       # stories only
bb board --type bug         # bugs only
```

## Valid Values

### Types
epic, story, task, bug, feature, chore, spike

### Statuses
open, confirmed, approved, in_progress, in_review, resolved, closed, failed, needs_info, backlog, todo, done, cancelled, wont_fix

### Priorities
critical, high, medium, low, none

### Comment Types
discussion, proposal, agent_output, test_report, execution_report
