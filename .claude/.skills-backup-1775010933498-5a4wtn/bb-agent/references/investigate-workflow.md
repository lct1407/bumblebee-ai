# Investigation Workflow

Step-by-step process for investigating a problem and creating work items.

## Step 1: Understand the Problem

Parse the user's description to identify:
- **What**: The observed behavior (error, wrong data, performance issue)
- **Where**: Which service/component (API, Web, CLI, Agent)
- **When**: Under what conditions (specific input, timing, user action)

## Step 2: Check Existing Items

Search for duplicates or related items using MCP tools:

```
bumblebee_work_items(action="list", project_slug="<slug>", data='{"status":"open"}')
bumblebee_work_items(action="list", project_slug="<slug>", data='{"type":"bug"}')
bumblebee_work_items(action="list", project_slug="<slug>", data='{"type":"task"}')
```

Search by keywords in titles. If the problem already has an open item, update it instead of creating a new one.

## Step 3: Reproduce the Problem

Attempt to reproduce using the appropriate method:

| Service | How to Reproduce |
|---------|-----------------|
| **API** | `curl` or `httpx` to the endpoint directly |
| **Web** | Browser DevTools: Console errors, Network tab, snapshot |
| **CLI** | Run the `bb` command with verbose output |
| **Agent** | Check worktree state, agent comments, logs |
| **Database** | Query the relevant tables directly |

Capture:
- Exact error messages and stack traces
- HTTP status codes and response bodies
- Console errors and network failures

## Step 4: Trace the Root Cause

Follow the error upstream through the architecture layers:

```
Web UI → API Client (fetch) → FastAPI Route → Service → SQLAlchemy → PostgreSQL
CLI    → httpx → FastAPI Route → Service → SQLAlchemy → PostgreSQL
```

Use these tools to trace:
- **Read source code** — find the handler, service function, model
- **Check schemas** — Pydantic validation, type mismatches
- **Check migrations** — `alembic current` vs schema drift
- **Check config** — `.env`, CORS origins, database URL

## Step 5: Assess Impact and Priority

| Priority | Criteria |
|----------|----------|
| **critical** | Data loss, security vulnerability, blocks all users |
| **high** | Core feature broken, no workaround, affects many users |
| **medium** | Feature degraded, workaround exists, moderate impact |
| **low** | Cosmetic, edge case, minor inconvenience |

## Step 6: Create Work Items

For each distinct root cause found, create a work item:

```
bumblebee_work_items(action="create", project_slug="<slug>", data='{"title":"<actionable title>","type":"bug","priority":"high"}')
```

### Title Format

Use action-oriented titles that describe the fix, not just the symptom:

| Bad Title | Good Title |
|-----------|-----------|
| "Login broken" | "Fix 500 error on Google OAuth login when client_id not configured" |
| "Items not showing" | "Fix WorkItemTreeResponse missing depth/children_count defaults" |
| "Slow page" | "Add pagination to work items list endpoint (currently loads all)" |

### Description Template

After creating the item, add a detailed description via comment:

```
bumblebee_comments(action="create", work_item_id="<id>", data='{"body":"## Problem\n<what is happening>\n\n## Root Cause\n<why it is happening — reference specific file:line>\n\n## Reproduction Steps\n1. <step 1>\n2. <step 2>\n3. <expected vs actual>\n\n## Suggested Fix\n<what needs to change>\n\n## Acceptance Criteria\n- [ ] <criterion 1>\n- [ ] <criterion 2>\n- [ ] <no regressions in related features>\n\n## Affected Files\n- `path/to/file.py:line`\n- `path/to/other.ts:line`","type":"discussion"}')
```

## Step 7: Create Sub-Tasks (If Complex)

If the fix requires multiple steps or touches multiple packages:

```
# Create parent item
bumblebee_work_items(action="create", project_slug="<slug>", data='{"title":"Fix authentication flow across API and Web","type":"story","priority":"high"}')

# Create sub-tasks under the parent (use the parent's id from the response)
bumblebee_work_items(action="create", project_slug="<slug>", data='{"title":"Fix JWT token validation in API middleware","type":"task","parent_id":<parent_id>}')
bumblebee_work_items(action="create", project_slug="<slug>", data='{"title":"Update auth context in Web to handle token refresh","type":"task","parent_id":<parent_id>}')
bumblebee_work_items(action="create", project_slug="<slug>", data='{"title":"Add integration test for full auth flow","type":"task","parent_id":<parent_id>}')
```

## Step 8: Summarize Findings

Present the investigation results to the user:

```
## Investigation Summary

**Problem**: <one-line summary>
**Root Cause**: <what's actually wrong>
**Impact**: <who/what is affected>

### Items Created
- BB-<N> <title> (priority: <p>, type: <t>)
- BB-<N> <title> (priority: <p>, type: <t>)

### Recommended Next Steps
1. <most urgent fix>
2. <secondary fix>
3. <preventive measure>
```

## Common Investigation Patterns

### API Returns 500
1. Check uvicorn/FastAPI logs for the traceback
2. Test the endpoint with `curl` directly
3. Check if the Pydantic schema matches the SQLAlchemy model
4. Check if migrations are up to date

### Web Page Not Loading Data
1. Open browser DevTools → Network tab
2. Check for CORS errors in Console
3. Check if the API endpoint returns data via `curl`
4. Check React Query error state in components

### CLI Command Fails
1. Run with verbose/debug output
2. Check `~/.bumblebee/config.toml` for correct API URL and token
3. Test the API endpoint directly
4. Check Python package version matches API expectations

### Items Missing or Wrong Data
1. Query the database directly to see raw data
2. Check soft-delete filter (`deleted_at IS NULL`)
3. Check if project ownership matches (`project.owner_id == user.id`)
4. Check serialization schema for missing/wrong fields
