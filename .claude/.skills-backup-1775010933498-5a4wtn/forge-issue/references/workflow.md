# Issue Resolution Workflow

Step-by-step process for resolving a Forge issue.

## Step 1: Fetch Issue Data

For each documentId provided, fetch the full issue and its comments in parallel:

```
forge_issues → get → { documentId: "<id>" }
forge_comments → list → { filters: { issue: "<documentId>" } }
```

Review all returned data:
- **Core**: title, description, status, priority, category
- **Criteria**: acceptanceCriteria, aiAcceptanceCriteria
- **Solutions**: suggestedSolution, aiSuggestedSolution
- **Plan**: plan (pre-approved implementation plan, if set)
- **Context**: attachments, changeHistory, comments

For multiple issues, fetch all in parallel to minimize round trips.

## Step 2: Triage — Is This Actionable?

Before investing tokens, check if the issue has enough detail to act on. An issue is **too generic** if:

- Description is vague with no concrete scope (e.g. "improve performance", "fix bugs")
- No acceptance criteria (author or AI) and no suggested solution
- Cannot determine what files, features, or behaviors are involved

If the issue is too generic to act on:

```
forge_issues → update → { documentId: "<id>", data: { status: "needs_info" } }
forge_comments → create → { data: { body: "Moved to needs_info — ...", issue: "<documentId>" } }
```

Explain specifically what's missing: scope, affected files/features, expected behavior, or acceptance criteria. Then **stop** — do not create a branch or proceed further.

## Step 3: Create Branch

Create a feature branch from the current branch:

```bash
git checkout -b ISS-XX-short-title
```

Use the issue ID + a slugified title (e.g. `ISS-25-streaming-chat-format`). For multiple issues, use the first issue's ID and a combined short description.

## Step 4: Read Codebase Context

Read project knowledge to understand conventions before writing code:

- **`.forge/knowledge.json`** — project structure, file organization, conventions, available commands
- **`.forge/lessons.md`** — previous learnings, gotchas, patterns discovered in past sessions

Use the knowledge to follow existing patterns rather than inventing new ones.

## Step 5: Update Status

Mark all issues as in progress so the team knows work has started:

```
forge_issues → update → { documentId: "<id>", data: { status: "in_progress" } }
```

Do this for each issue being worked on.

## Step 6: Plan or Execute

**If the issue has a `plan` field:** The plan is pre-approved by the user. Execute it directly — do not re-plan, second-guess, or skip steps. Follow it faithfully.

**If no plan and task is complex** (touches 3+ files, multiple packages, or requires architectural decisions): Enter plan mode first. After planning, save the plan to the issue:

```
forge_issues → update → { documentId: "<id>", data: { plan: "<markdown>" } }
```

**If no plan and task is simple** (single file fix, straightforward change): Proceed directly to implementation.

## Step 7: Implement

Write the code changes:

- **Stay on the feature branch** — never run `git checkout` or switch branches mid-work
- **Follow acceptance criteria** — both author-written and AI-generated criteria
- **Match existing patterns** — use conventions from knowledge.json and surrounding code
- **Both web and dev** — if the change affects UI shared between web and desktop apps, apply to both packages for feature parity
- **Minimal changes** — only modify what's needed. Don't refactor surrounding code, add comments to unchanged code, or "improve" things outside scope

## Step 8: Verify

Run the appropriate test command to catch regressions:

- Check `CLAUDE.md` or `.forge/knowledge.json` for the package-specific test command
- Common commands: `npx vitest` (web/dev/strapi), `npm test` (nexus)
- Run from the correct package directory (e.g. `forge/web/`, `forge/strapi/`)
- Fix any test failures before proceeding — do not skip failing tests

If no test command is available, at minimum verify TypeScript compilation passes.

## Step 9: Commit

Stage and commit with a clear, descriptive message:

- Use conventional commit format: `feat:`, `fix:`, `refactor:`, etc.
- Message should explain **what** changed and **why** (not just "fix issue")
- Reference the issue ID in the commit body (e.g. `Resolves ISS-25`)
- Stage specific files — avoid `git add .` which can include unintended files

## Step 10: Code Review

Do a thorough self-review of all changes. Run `git diff HEAD~1` to see the full diff, then read through every changed file looking for:

- **Bugs**: incorrect logic, off-by-one errors, null/undefined risks, wrong variable used
- **Dead code**: unused variables, unreachable branches, refs that are set but never read, unused imports
- **Edge cases**: empty arrays, missing null checks at boundaries, race conditions in async code
- **Type issues**: incorrect casts, missing type narrowing, `any` leaks, wrong generic params
- **React issues**: `useEffect` with wrong/missing deps, `useMemo`/`useCallback` missing deps, unstable keys, state updates on unmounted components
- **Consistency**: web and dev implementations should match in behavior and patterns

Present findings as a table with severity (Bug/Minor/Low) and whether each needs fixing. Fix all bugs and important issues, then commit separately with a `fix:` prefix so the review fixes are distinct from the implementation.

## Step 11: Code Simplifier

After the review is clean, launch a code simplifier agent to polish the implementation:

```
Task → subagent_type: "code-simplifier"
  mode: "bypassPermissions"
  prompt: "Simplify and refine the recently modified code in this branch.
           Focus on the files changed in the last 2 commits (run `git diff HEAD~2 --name-only`).
           Look for: redundancy, unnecessary complexity, inconsistencies between
           web and dev versions, nested ternaries, duplicate imports, code that
           can be simplified while preserving all functionality."
```

Review what the agent changed, then commit any simplifications.

## Step 12: Post Comment

Post a summary comment on the issue describing what was done (see `comments.md` for style guide):

```
forge_comments → create → { data: { body: "<markdown>", issue: "<documentId>" } }
```

The comment should cover:
- What features/fixes were implemented
- Any notable design decisions
- Both web and desktop if both were changed

Do NOT include: file paths, function names, code snippets, or commit hashes.

## Step 13: Resolve

After tests pass, review is clean, and all changes are committed:

```
forge_issues → update → { documentId: "<id>", data: { status: "resolved" } }
```

Also update the plan field with final implementation status if the plan was previously set:

```
forge_issues → update → { documentId: "<id>", data: { plan: "<updated plan with ✅ markers>" } }
```

## Step 14: Capture Learnings

If you discovered anything useful during implementation, append to `.forge/lessons.md`:

```markdown
## [YYYY-MM-DD]
- Pattern: useful pattern found during this work
- Gotcha: non-obvious behavior that caused issues
```

Only add genuine learnings — don't force entries if nothing notable was discovered.
