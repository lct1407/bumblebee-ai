# Work Item Resolution Workflow

Step-by-step process for resolving a Bumblebee work item.

## Step 1: Fetch Work Item Data

For each id_or_number provided, fetch the full item and its comments using MCP tools:

```
bumblebee_work_items(action="get", item_id="<id>")
bumblebee_comments(action="list", work_item_id="<id>")
```

Review all returned data:
- **Core**: title, type, description, status, priority, assignee
- **Criteria**: acceptance_criteria
- **Plan**: plan (pre-approved implementation plan, if set)
- **Context**: comments (proposals, execution reports, test reports)

For multiple items, fetch all in parallel to minimize round trips.

## Step 2: Triage — Is This Actionable?

Before investing effort, check if the item has enough detail to act on. An item is **too generic** if:

- Description is vague with no concrete scope (e.g. "improve performance", "fix bugs")
- No acceptance criteria and no plan
- Cannot determine what files, features, or behaviors are involved

If the item is too generic:
```
bumblebee_work_items(action="update", item_id="<id>", data='{"status":"needs_info"}')
bumblebee_comments(action="create", work_item_id="<id>", data='{"body":"Moved to needs_info — [explain what is missing]","type":"discussion"}')
```
Then **stop**.

## Step 3: Read Knowledge Base

Read project context to understand conventions before writing code:

- **CLAUDE.md** — project structure, commands, conventions
- **docs/knowledge.md** — tech stack details, status enums, patterns
- **.claude/lessons-learned.md** — previous learnings and gotchas

Use the knowledge to follow existing patterns rather than inventing new ones.

## Step 4: Create Branch / Worktree

The CLI creates a git worktree for isolated work:

- **Worktree path**: `~/.bumblebee/worktrees/{project_slug}/item-{number}`
- **Branch**: `{type_prefix}/{key}_{slugified_title}`

Branch naming convention:
| Work Item Type | Prefix |
|---------------|--------|
| epic | `epic/` |
| story | `feat/` |
| task | `task/` |
| bug | `fix/` |
| feature | `feat/` |
| chore | `chore/` |
| spike | `spike/` |

Example: `feat/bb-42_user-authentication` in `~/.bumblebee/worktrees/my-project/item-42`

If using the skill interactively (not via CLI), create a branch manually:
```bash
git checkout -b {type_prefix}/{key}_{slugified_title}
```

## Step 5: Update Status

Mark the item as in progress:
```
bumblebee_work_items(action="update", item_id="<id>", data='{"status":"in_progress"}')
```

## Step 6: Plan or Execute

**If the item has a `plan` field:** The plan is pre-approved. Execute it directly — do not re-plan or skip steps.

**If no plan and task is complex** (touches 3+ files, multiple packages, or requires architectural decisions): Analyze first, then save the plan:
```
bumblebee_comments(action="create", work_item_id="<id>", data='{"body":"<markdown plan>","type":"proposal"}')
```

**If no plan and task is simple** (single file fix, straightforward change): Proceed directly to implementation.

## Step 7: Implement

Write the code changes:

- **Stay on the feature branch** — never switch branches mid-work
- **Follow acceptance criteria** if provided
- **Match existing patterns** — use conventions from CLAUDE.md and surrounding code
- **Minimal changes** — only modify what's needed. Don't refactor surrounding code or "improve" things outside scope

## Step 8: Run Tests

Run the appropriate test commands to catch regressions:

- Check CLAUDE.md for package-specific test commands
- Common commands: `pytest` (API), `vitest` / `npm test` (web), `npm run build` (web)
- Run from the correct package directory
- Fix any test failures before proceeding

## Step 9: Self-Review

Review all changes via `git diff HEAD~1`:

- **Bugs**: incorrect logic, off-by-one errors, null risks
- **Dead code**: unused variables, unreachable branches
- **Edge cases**: empty arrays, missing null checks
- **Type issues**: incorrect casts, missing validation
- **Security**: injection risks, exposed secrets

Fix any issues found and commit separately.

## Step 10: Code Simplify

Launch a code simplifier agent to polish the implementation:

```
Task → subagent_type: "code-simplifier"
  prompt: "Simplify the recently modified code. Focus on files changed
           in the last 2 commits (run `git diff HEAD~2 --name-only`).
           Look for redundancy, unnecessary complexity, and inconsistencies."
```

Review and commit any simplifications.

## Step 11: Commit

Stage and commit with a clear message:

- Use conventional commit format: `feat:`, `fix:`, `refactor:`, etc.
- Reference the work item key in the message (e.g. `feat: add auth flow [BB-42]`)
- Stage specific files — avoid `git add .`

## Step 12: Test Gate

Run the full test suite one final time:

- If all tests pass → continue to Step 13
- If tests fail → post a test report comment, set status to `failed`, and stop

```
bumblebee_comments(action="create", work_item_id="<id>", data='{"body":"<test report markdown>","type":"test_report"}')
bumblebee_work_items(action="update", item_id="<id>", data='{"status":"failed"}')
```

## Step 13: Post Comment

Post a summary comment on the work item:

```
bumblebee_comments(action="create", work_item_id="<id>", data='{"body":"<summary of changes>","type":"agent_output"}')
```

The comment should cover:
- What was implemented or fixed
- Key design decisions
- Any caveats or follow-up items

## Step 14: Resolve

After tests pass, review is clean, and changes are committed:

```
bumblebee_work_items(action="update", item_id="<id>", data='{"status":"in_review"}')
```

Suggest the merge command:
```
Merge with: git checkout release/dev && git merge {branch}
Or: bb agent merge --target release/dev
```
