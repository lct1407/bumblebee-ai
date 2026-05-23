---
name: root-cause-tracing
description: |
  Systematic root cause analysis for errors in multi-service architectures.
  Use when: (1) the displayed error is not the actual cause, (2) failures span
  multiple services, (3) test failures have unclear origin, (4) agent workflow
  pipeline failures. Traces errors back through service boundaries to find
  the true root cause.
---

# Root Cause Tracing

Systematic method for tracing errors back to their true origin in multi-service
architectures (API + Web + CLI + Agent worktrees).

## When to Use

- **Misleading errors**: The displayed error is a symptom, not the cause
- **Multi-service failures**: Error crosses API, WebSocket, CLI, or Agent boundaries
- **Test failures with unclear origin**: Test fails but the root cause is elsewhere
- **Agent workflow failures**: Pipeline breaks during suggest, execute, test, or merge
- **Cascading failures**: One failure triggers a chain of secondary errors

## Tracing Process

### Step 1: Capture the Symptom

Record the exact error before investigating. Do not interpret yet.

```
Symptom: <exact error message>
Location: <where it was observed — service, endpoint, component>
Trigger: <what action caused it>
```

### Step 2: Identify the Error Boundary

Determine which service boundary the error crosses:

```
Web UI → API Client → API Route → Service → Database
CLI    → HTTP Client → API Route → Service → Database
Agent  → Worktree → CLI → API
```

### Step 3: Trace Upstream

Follow the error from where it's observed back to its origin:

1. **Start at the symptom** — read the error message and stack trace
2. **Check the immediate caller** — is the error generated here or passed through?
3. **Cross service boundary** — check logs/responses from the upstream service
4. **Repeat** until you find where the error is first generated

### Step 4: Verify Root Cause

Confirm the root cause by checking:
- Can you reproduce the error by directly triggering the root cause?
- Does fixing the root cause eliminate all downstream symptoms?
- Are there other symptoms that share this same root cause?

### Step 5: Document Findings

```
## Root Cause Analysis

**Symptom**: <what the user sees>
**Root Cause**: <actual problem at file:line>
**Why**: <explanation of why this causes the symptom>
**Fix**: <what needs to change>
**Verification**: <how to confirm the fix works>
```

## Common Patterns

### Error Masking
The real error is caught and re-thrown as a generic error.
→ Search for `except Exception` / `catch (error)` blocks that swallow details.

### Schema Mismatch
API returns data that doesn't match the client's expected shape.
→ Compare API response schema with client type definitions.

### Missing Migration
Database schema is out of sync with model definitions.
→ Check `alembic current` or equivalent migration status.

### Config Drift
Environment variables differ between services or environments.
→ Compare `.env` files across services.

### Race Condition
Error only occurs under specific timing conditions.
→ Look for async operations without proper await/locking.
