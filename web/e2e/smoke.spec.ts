import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the public surface — verify each major page renders
 * without crashing. Auth-gated flows are covered separately (auth.spec.ts).
 */

test.describe("smoke — public pages", () => {
  test("landing page renders hero", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Bumblebee/i);
    await expect(page.locator("body")).toContainText(/agents|project|bumblebee/i);
  });

  test("register page has form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("login page has form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("pricing page lists 3 plans", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("body")).toContainText(/free/i);
    await expect(page.locator("body")).toContainText(/pro/i);
    await expect(page.locator("body")).toContainText(/team/i);
  });
});

test.describe("smoke — app pages", () => {
  test("dashboard route loads", async ({ page }) => {
    await page.goto("/dashboard");
    // Auth gate may redirect to /login — accept either outcome
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(dashboard|login)/);
  });

  test("issues route loads", async ({ page }) => {
    await page.goto("/issues");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(issues|login)/);
  });

  test("help page renders accordion sections", async ({ page }) => {
    await page.goto("/help");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/help")) {
      await expect(page.locator("body")).toContainText(/hướng dẫn|guide|help/i);
      // 7 accordion sections expected
      const sections = await page.locator("button:has-text('+'), button:has-text('−')").count();
      expect(sections).toBeGreaterThanOrEqual(6);
    }
  });

  test("devices settings page renders pair form", async ({ page }) => {
    await page.goto("/settings/devices");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/settings/devices")) {
      // Pairing code input exists
      await expect(page.locator('input[pattern]')).toBeVisible();
    }
  });
});

test.describe("smoke — api + graphql", () => {
  test("api health endpoint returns 200/307", async ({ request }) => {
    const apiUrl = process.env.API_BASE_URL || "http://localhost:8000";
    const r = await request.get(`${apiUrl}/health/`);
    expect([200, 307].includes(r.status())).toBeTruthy();
  });

  test("graphql introspection works", async ({ request }) => {
    const apiUrl = process.env.API_BASE_URL || "http://localhost:8000";
    const r = await request.post(`${apiUrl}/graphql`, {
      data: { query: "{ __schema { queryType { name } mutationType { name } } }" },
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.data.__schema.queryType.name).toBe("Query");
    expect(body.data.__schema.mutationType.name).toBe("Mutation");
  });

  test("graphql me query resolves (anonymous returns null)", async ({ request }) => {
    const apiUrl = process.env.API_BASE_URL || "http://localhost:8000";
    const r = await request.post(`${apiUrl}/graphql`, {
      data: { query: "{ me { id name } }" },
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.errors).toBeUndefined();
    // Without auth, me should be null
    expect(body.data.me).toBeNull();
  });
});
