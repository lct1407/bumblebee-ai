# Prompt Templates Reference

Structure of prompts used in each phase of the agent workflow.

## Common Header

All prompts start with:
```
You are {action} {item_type} {key}: {title}

Type: {type}  |  Priority: {priority}  [|  Status: {status}]
```

Followed by optional sections (included only when data exists):
- `## Description` — work item description
- `## Acceptance Criteria` — acceptance criteria
- `## Implementation Plan` / `## Existing Plan` — plan field
- `## Previous Comments / Progress` — formatted comment history
- `## Project Knowledge Base` — contents of CLAUDE.md, docs/knowledge.md, .claude/lessons-learned.md

## Phase 1: Suggest (Analysis)

**Purpose**: Analyze the work item and produce a plan. No code changes.

**Key instruction**:
```
Analyse this work item **and** the project source code. Return a Markdown plan:

1. **Root Cause / Analysis** -- what needs to change and why
2. **Files to Modify** -- list every file with a short description
3. **Implementation Steps** -- numbered, concrete steps
4. **Testing Strategy** -- how to verify the changes
5. **Risks & Considerations** -- edge cases, breaking changes

IMPORTANT: Do NOT modify any files. Only analyse and produce the plan.
```

**CLI command**: `bb agent suggest <id>`
**Claude flags**: `-p <prompt> --output-format text`
**Comment type**: `proposal`

## Phase 2: Execute (Implementation)

**Purpose**: Implement the changes in a git worktree.

**Key instruction**:
```
Implement the changes described in the plan / comments above.

1. Follow the project's existing coding conventions and patterns
2. Work through changes one file at a time
3. Run existing tests after your changes and fix any failures
4. Add new tests where appropriate
5. Commit your work with a clear, descriptive commit message
6. If you hit a blocker, document it clearly
```

**CLI command**: `bb agent execute <id>`
**Claude flags**: `--output-format stream-json --verbose --permission-mode bypassPermissions --mcp-config -`
**Comment type**: `agent_output`

## Phase 3: Test (Verification)

**Purpose**: Run tests and report results. No code changes.

**Key instruction**:
```
Run ALL relevant tests and verify the implementation:

1. Identify test commands from CLAUDE.md or project config
2. Run all relevant test suites
3. Check acceptance criteria from the work item
4. Review the git diff for obvious issues

Return a structured test report:

## Test Report
### Results
- **Status**: PASS or FAIL
- **Tests run**: <count>
- **Passed**: <count>
- **Failed**: <count>

### Failing Tests (if any)
### Acceptance Criteria Check
### Root Cause Analysis (if failures)

IMPORTANT: Do NOT fix any code. Only run tests and report results.
```

**CLI command**: `bb agent test <id>`
**Claude flags**: `-p <prompt> --output-format text`
**Comment type**: `test_report`

## Phase 4: Reimplement (Fix from Failure)

**Purpose**: Re-implement based on test failure feedback. Runs in worktree with full permissions.

**Key instruction**:
```
**IMPORTANT: A previous implementation attempt had test failures.**
Read the comments below — they contain the original plan,
execution report, and test failure details.

1. Read the test report and failure reasons from previous comments
2. Identify what went wrong in the previous implementation
3. Fix the issues — focus on root causes from the test report
4. Ensure all tests pass after your changes
5. Run the full test suite to verify no regressions
6. Commit your fixes with a clear message referencing the re-implementation
```

**CLI command**: `bb agent reimplement <id>`
**Claude flags**: `--output-format stream-json --verbose --permission-mode bypassPermissions --mcp-config -`
**Comment type**: `agent_output`

## Comment Context Format

All phases receive previous comments formatted as:

```markdown
## Previous Comments / Progress

### {author} [{type}] -- {created_at}
{body}

### {author} [{type}] -- {created_at}
{body}
```

This ensures the agent has full context of prior analysis, implementation attempts, and test results.

## Full Loop Flow

```
bb agent run <id> --auto-merge --target release/dev

  Phase 1: suggest → post proposal comment → status: confirmed
  Phase 2: execute → spawn Claude in worktree → post execution report
  Phase 3: test   → run tests → post test report
    ├─ PASS → merge to target → status: resolved → cleanup worktree
    └─ FAIL → status: failed → retry if --max-retries > 0
                └─ reimplement → test again → ...
```
