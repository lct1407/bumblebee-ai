---
name: e2e-playwright
description: |
  E2E testing with Playwright. Use for: creating tests from user stories,
  fixing failing tests, reviewing test coverage. Reports bugs to /docs/bugs
  and integrates with nextjs skill for fixes.
---

# E2E Playwright Testing

## Quick Reference

| Item | Location |
|------|----------|
| Tests | `e2e/tests/[NN-module]/*.spec.ts` |
| Page objects | `e2e/tests/pages/*.page.ts` |
| Data factories | `e2e/tests/data/factories.ts` |
| Bug reports | `docs/bugs/` |

## Running Tests

**Always use `test:reuse` to reuse existing test users (faster):**

```bash
cd e2e
npm run test:reuse                      # Run all tests (default)
npm run test:reuse -- -g "EMP-001"      # Single test by name
npm run test:reuse -- --project=04-employees  # Single module
```

Only use `test:clean` when test users are corrupted or need fresh data.

---

## Bug Reporting Workflow

When E2E tests find frontend bugs:

### 1. Create Bug Report

Write to `docs/bugs/FE-BUG-[DATE].md`:

```markdown
# Frontend Bug Report - [Date]

## Bug: [Title]

**Test**: `[test-file]:line` - [test name]
**Location**: `frontend/src/[path]`
**Severity**: Critical | High | Medium | Low

### Issue
[Description of what's wrong]

### Expected
[What should happen]

### Actual
[What actually happens]

### Code Analysis
```typescript
// Current code causing issue
```

### Suggested Fix
```typescript
// How to fix it
```
```

### 2. Call nextjs Skill to Fix

After creating bug report, invoke nextjs skill:

```
Use /nextjs skill to fix the bug documented in docs/bugs/FE-BUG-[DATE].md
```

The nextjs skill will:
- Read the bug report
- Locate the frontend file
- Apply the fix
- Verify the fix works

---

## Core Rules

### 1. Frontend-First
Read frontend code before writing tests.

### 2. Error-First Assertions
Check errors BEFORE success. Never hide failures.

```typescript
await page.getByRole('button', { name: /save/i }).click();

await expect(async () => {
    const hasError = await page.getByText(/error|failed/i).first().isVisible().catch(() => false);
    if (hasError) {
        throw new Error(`Failed: ${await page.getByText(/error/i).first().textContent()}`);
    }
    const hasSuccess = await page.getByText(/success/i).first().isVisible().catch(() => false);
    const redirected = !page.url().includes('/new');
    expect(hasSuccess || redirected).toBe(true);
}).toPass({ timeout: 10000 });
```

### 3. Verify After Create
Confirm created data appears in the UI.

### 4. Report Bugs
When tests fail due to frontend issues, create bug report in `docs/bugs/`.

---

## Common Selectors

| Component | Selector |
|-----------|----------|
| Input | `getByLabel('Label')` |
| Button | `getByRole('button', { name: /text/i })` |
| Custom Select | `getByLabel('Label').click()` → `getByRole('option', { name })` |
| Modal | `getByRole('dialog')` |
| Table row | `getByRole('row').filter({ hasText })` |

---

## Quick Fixes

| Issue | Fix |
|-------|-----|
| Strict mode | Add `.first()` |
| Custom Select | Use `click()` + `getByRole('option')` |
| Silent redirect | Accept toast OR redirect |
| Test passes but broken | Remove try/catch |

---

## References

- `references/patterns.md` - Test structure, assertions, flows
- `references/selectors.md` - UI selectors, page objects
- `references/troubleshooting.md` - Issues and debugging
