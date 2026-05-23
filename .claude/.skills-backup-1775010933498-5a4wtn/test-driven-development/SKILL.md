---
name: test-driven-development
description: |
  Test-Driven Development discipline for the Bumblebee monorepo.
  Enforces Red-Green-Refactor cycle across Python (pytest), TypeScript (Vitest),
  and E2E (Playwright). Use when writing any new feature, fixing bugs, or
  adding behavior to api/, web/, or cli/ packages.
---

# Test-Driven Development

## The Iron Law

**NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

Never write implementation code unless you have a test that fails because that code does not exist yet. This is not optional. This is not aspirational. This is the rule.

## Red-Green-Refactor Cycle

Every change follows three strict phases:

### RED -- Write a Failing Test

1. Write the smallest test that describes the behavior you need.
2. Run it. Watch it fail. Confirm it fails for the RIGHT reason.
3. If it passes, your test is wrong or the behavior already exists. Stop and reassess.

### GREEN -- Make It Pass

1. Write the MINIMUM production code to make the failing test pass.
2. Do not generalize. Do not clean up. Do not add "while I'm here" changes.
3. Run the test. It must pass. All other tests must still pass.

### REFACTOR -- Clean Up

1. Improve the code structure without changing behavior.
2. Run all tests after every change. They must all pass.
3. Refactor both production code AND test code if needed.

Then repeat. Every cycle should take minutes, not hours.

## Good Test Qualities

- **Minimal**: Test one behavior. One assertion concept per test.
- **Clear**: A reader should understand the expected behavior from the test name and body alone.
- **Shows intent**: The test name describes WHAT should happen, not HOW.
- **Fast**: Unit tests run in milliseconds. Keep them that way.
- **Isolated**: No test depends on another test running first.

## Common Rationalizations (And Why They Are Wrong)

| Rationalization | Counter |
|----------------|---------|
| "I'll write the tests after" | You won't. And if you do, they'll test your implementation, not your intent. |
| "This is too simple to test" | Simple code gets complex. The test documents the expected behavior. |
| "I'm just refactoring" | Refactoring changes structure, not behavior. If tests pass, you're safe. If you skip tests, you're guessing. |
| "It's just a config change" | Config bugs are production bugs. Test the effect. |
| "Tests slow me down" | Tests slow you down now. Bugs slow you down forever. |
| "I'll just manually test it" | Manual tests evaporate. Automated tests compound. |

## Bumblebee Test Structure

```
api/tests/                          # Python: pytest + pytest-asyncio
  conftest.py                       # Fixtures (async client, db session, auth)
  test_health.py
  test_work_items.py
  test_auth.py

cli/tests/                          # Python: pytest + typer.testing
  test_item_commands.py
  test_agent_commands.py

web/src/**/*.test.ts                # TypeScript: Vitest + testing-library
web/src/**/*.test.tsx               # Component tests alongside source
web/e2e/                            # Playwright E2E tests
  *.spec.ts
```

### File Naming Conventions

| Package | Pattern | Location |
|---------|---------|----------|
| api (Python) | `test_*.py` | `api/tests/` directory |
| cli (Python) | `test_*.py` | `cli/tests/` directory |
| web (TypeScript) | `*.test.ts` / `*.test.tsx` | Alongside source files |
| E2E (Playwright) | `*.spec.ts` | `web/e2e/` directory |

## Examples by Package

### API -- Python (pytest + httpx.AsyncClient)

**RED** -- Write the failing test:

```python
# api/tests/test_work_items.py
import pytest

async def test_create_work_item_returns_201(client, auth_headers):
    resp = await client.post(
        "/api/projects/bb/work-items",
        json={"title": "New task", "type": "task"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "New task"
    assert data["type"] == "task"
    assert "id" in data
```

Run it: `cd api && python -m pytest tests/test_work_items.py::test_create_work_item_returns_201 -x`

Confirm it fails (endpoint not implemented / returns 404 or 405).

**GREEN** -- Write the minimum endpoint code to pass.

**REFACTOR** -- Extract shared fixtures, improve naming, remove duplication.

Shared fixtures live in `api/tests/conftest.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient
from src.main import create_app

@pytest.fixture
async def client():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-token"}
```

### CLI -- Python (typer.testing.CliRunner)

**RED**:

```python
# cli/tests/test_item_commands.py
from typer.testing import CliRunner
from bb.main import app

runner = CliRunner()

def test_item_list_shows_items():
    result = runner.invoke(app, ["item", "list", "--type", "task"])
    assert result.exit_code == 0
    assert "task" in result.stdout.lower()
```

Run it: `cd cli && python -m pytest tests/test_item_commands.py::test_item_list_shows_items -x`

**GREEN** -- Implement just enough CLI logic to make the test pass.

**REFACTOR** -- Extract helpers, improve output formatting.

### Web -- TypeScript (Vitest + @testing-library/react)

**RED**:

```typescript
// web/src/components/work-items/shared/status-badge.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(<StatusBadge status="open" />);
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("applies semantic color for 'done' status", () => {
    render(<StatusBadge status="done" />);
    const badge = screen.getByText("done");
    expect(badge.className).toMatch(/green|success/);
  });
});
```

Run it: `cd web && npx vitest run src/components/work-items/shared/status-badge.test.tsx`

**GREEN** -- Build the component to satisfy the test.

**REFACTOR** -- Extract color logic, simplify markup.

### E2E -- Playwright

**RED**:

```typescript
// web/e2e/work-items.spec.ts
import { test, expect } from "@playwright/test";

test("user can create a work item from the board view", async ({ page }) => {
  await page.goto("/projects/bb/board");
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByLabel(/title/i).fill("E2E test item");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("E2E test item")).toBeVisible();
});
```

Run it: `cd web && npx playwright test e2e/work-items.spec.ts`

**GREEN** -- Implement the create flow in the board view.

**REFACTOR** -- Extract page objects, improve selectors.

## Running Tests

```bash
# API (Python)
cd api && python -m pytest tests/ -x -v
cd api && python -m pytest tests/test_health.py -x       # Single file
cd api && python -m pytest tests/ -k "test_create" -x    # By name pattern

# CLI (Python)
cd cli && python -m pytest tests/ -x -v

# Web (Vitest)
cd web && npx vitest run                                  # All tests
cd web && npx vitest run src/path/to/file.test.tsx        # Single file
cd web && npx vitest --watch                              # Watch mode

# E2E (Playwright)
cd web && npx playwright test                             # All E2E
cd web && npx playwright test e2e/specific.spec.ts        # Single file
```

## Bug Fix Workflow (Complete Example)

**Scenario**: `bb item show BB-42` returns 500 when the item has no assignee.

### Step 1 -- RED

```python
# api/tests/test_work_items.py
async def test_show_item_without_assignee(client, auth_headers):
    """Bug: GET /api/work-items/{id} crashes when assignee is None."""
    # Create item with no assignee
    create_resp = await client.post(
        "/api/projects/bb/work-items",
        json={"title": "No assignee item", "type": "bug"},
        headers=auth_headers,
    )
    item_id = create_resp.json()["id"]

    resp = await client.get(f"/api/work-items/{item_id}", headers=auth_headers)
    assert resp.status_code == 200  # NOT 500
    assert resp.json()["assignee"] is None
```

Run: test fails with 500. Good. Confirmed the bug.

### Step 2 -- GREEN

Fix the serializer to handle `None` assignee. Run the test. It passes.

### Step 3 -- REFACTOR

Clean up the null handling. Run ALL tests. Everything passes. Done.

## Checklist Before Committing

- [ ] Every new behavior has a test written BEFORE the implementation.
- [ ] All tests pass (`pytest` for api/cli, `vitest` for web).
- [ ] No test was skipped or commented out to make the suite green.
- [ ] Test names describe the expected behavior, not the implementation.
- [ ] Refactoring was done as a separate step with passing tests throughout.
