/**
 * Bumblebee v0.4.0 — Full E2E walkthrough as admin user.
 * Captures screenshot + JSON transcript per step.
 *
 * Run: cd D:/Source/bumblebee-v3/web && node ../../Bumblebee-cli/plans/reports/walkthrough-260521-screenshots/walkthrough.mjs
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const API = process.env.API_URL || "http://127.0.0.1:8003";
const WEB = process.env.WEB_URL || "http://127.0.0.1:3000";
const OUT = resolve(process.cwd(), "../../Bumblebee-cli/plans/reports/walkthrough-260521-screenshots");
mkdirSync(OUT, { recursive: true });

const transcript = [];
let stepNum = 0;

function step(name) {
  stepNum += 1;
  const id = `${String(stepNum).padStart(2, "0")}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  console.log(`\n[step ${stepNum}] ${name}`);
  return { id, name, ts: new Date().toISOString(), actions: [] };
}

async function shoot(page, s, label = "") {
  const file = `${s.id}${label ? "-" + label : ""}.png`;
  await page.screenshot({ path: resolve(OUT, file), fullPage: true });
  s.actions.push({ type: "screenshot", file });
  console.log(`  📸 ${file}`);
}

async function call(method, path, body, headers = {}) {
  const opts = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (msg) => { if (msg.type() === "error") console.log("  console.error:", msg.text()); });

  let bearer = "";
  let apiKey = "";
  let issueId = "";

  // ============ STEP 1: Visit landing page ============
  {
    const s = step("landing-page");
    await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shoot(page, s, "hero");
    // Scroll through sections
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
    await page.waitForTimeout(400);
    await shoot(page, s, "features");
    await page.evaluate(() => window.scrollTo({ top: 2400, behavior: "instant" }));
    await page.waitForTimeout(400);
    await shoot(page, s, "showcase");
    await page.evaluate(() => window.scrollTo({ top: 99999, behavior: "instant" }));
    await page.waitForTimeout(400);
    await shoot(page, s, "footer");
    transcript.push(s);
  }

  // ============ STEP 2: Register admin via API ============
  {
    const s = step("register-admin");
    const res = await call("POST", "/api/auth/register", {
      email: "admin@bumblebee.ai",
      username: "admin",
      password: "AdminBumblebee2026!",
      full_name: "Administrator",
    });
    s.actions.push({ type: "api", method: "POST", path: "/api/auth/register", status: res.status, response: res.body });
    if (res.status === 201) {
      bearer = res.body.access_token;
      console.log(`  ✓ admin registered: ${res.body.user.id}`);
    }
    transcript.push(s);
  }

  // ============ STEP 3: Login as admin ============
  {
    const s = step("login-admin");
    const res = await call("POST", "/api/auth/login", {
      username: "admin",
      password: "AdminBumblebee2026!",
    });
    s.actions.push({ type: "api", method: "POST", path: "/api/auth/login", status: res.status });
    if (res.status === 200) {
      bearer = res.body.access_token;
      console.log(`  ✓ logged in, token: ${bearer.slice(0, 30)}...`);
    }
    transcript.push(s);
  }

  // ============ STEP 4: Create API key for headless use ============
  {
    const s = step("create-api-key");
    const res = await call("POST", "/api/auth/api-keys", { name: "demo-walkthrough" }, {
      Authorization: `Bearer ${bearer}`,
    });
    s.actions.push({ type: "api", method: "POST", path: "/api/auth/api-keys", status: res.status, response: res.body });
    if (res.status === 201) {
      apiKey = res.body.key;
      console.log(`  ✓ api key: ${apiKey}`);
    }
    transcript.push(s);
  }

  // ============ STEP 5: /me check (validate auth dual modes) ============
  {
    const s = step("auth-me-verify");
    const r1 = await call("GET", "/api/auth/me", null, { Authorization: `Bearer ${bearer}` });
    const r2 = await call("GET", "/api/auth/me", null, { "X-BB-API-Key": apiKey });
    s.actions.push({ type: "api", method: "GET", path: "/api/auth/me (Bearer)", status: r1.status, response: r1.body });
    s.actions.push({ type: "api", method: "GET", path: "/api/auth/me (X-BB-API-Key)", status: r2.status, response: r2.body });
    transcript.push(s);
  }

  // ============ STEP 6: View dashboard (web) ============
  {
    const s = step("view-dashboard");
    await page.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await shoot(page, s);
    transcript.push(s);
  }

  // ============ STEP 7: View Issues list ============
  {
    const s = step("view-issues-list");
    await page.goto(`${WEB}/issues`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await shoot(page, s);
    transcript.push(s);
  }

  // ============ STEP 8: Create new issue via web form ============
  {
    const s = step("create-issue-via-web");
    await page.goto(`${WEB}/issues`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const input = page.locator('input[placeholder*="title"]').first();
    await input.fill("E2E Walkthrough — Real Claude classification test");
    await shoot(page, s, "before-submit");
    await page.locator("button:has-text('Create')").click();
    await page.waitForTimeout(1500);
    await shoot(page, s, "after-create");
    // Get its id via API
    const list = await call("GET", "/api/projects/bb/issues");
    const newIssue = list.body[0];
    issueId = newIssue.id;
    s.actions.push({ type: "api", method: "GET", path: "/api/projects/bb/issues", status: list.status, result: `BB-${newIssue.number} ${newIssue.title}` });
    console.log(`  ✓ created BB-${newIssue.number}`);
    transcript.push(s);
  }

  // ============ STEP 9: Open issue detail ============
  {
    const s = step("view-issue-detail");
    const list = await call("GET", "/api/projects/bb/issues");
    const num = list.body[0].number;
    await page.goto(`${WEB}/issues/${num}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await shoot(page, s);
    transcript.push(s);
  }

  // ============ STEP 10: Trigger workflow ============
  {
    const s = step("trigger-workflow");
    // via web UI button
    const triggerBtn = page.locator("button:has-text('Trigger Workflow')");
    await triggerBtn.click();
    await page.waitForTimeout(2000);
    await shoot(page, s, "triggered");
    // Wait for completion (poll up to 30s)
    let done = false;
    for (let i = 0; i < 30; i++) {
      const events = await call("GET", `/api/events?issue_id=${issueId}&limit=30`);
      const types = events.body.map((e) => e.type);
      if (types.includes("workflow_completed")) { done = true; break; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await shoot(page, s, "completed");
    s.actions.push({ type: "wait", result: done ? "workflow completed" : "timeout — still running" });
    transcript.push(s);
  }

  // ============ STEP 11: View event log on issue detail ============
  {
    const s = step("view-event-log");
    const events = await call("GET", `/api/events?issue_id=${issueId}&limit=30`);
    s.actions.push({
      type: "api",
      method: "GET",
      path: `/api/events?issue_id=${issueId}`,
      count: events.body.length,
      types: events.body.map((e) => e.type),
    });
    await shoot(page, s, "events-table");
    transcript.push(s);
  }

  // ============ STEP 12: View plugins page ============
  {
    const s = step("view-plugins");
    await page.goto(`${WEB}/plugins`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await shoot(page, s);
    // Click reload
    const reloadBtn = page.locator("button:has-text('Reload')");
    if (await reloadBtn.count() > 0) {
      await reloadBtn.click();
      await page.waitForTimeout(2000);
      await shoot(page, s, "after-reload");
    }
    transcript.push(s);
  }

  // ============ STEP 13: View notifications ============
  {
    const s = step("view-notifications");
    await page.goto(`${WEB}/notifications`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await shoot(page, s);
    transcript.push(s);
  }

  // ============ STEP 14: API-key authenticated workflow trigger ============
  {
    const s = step("api-key-workflow-trigger");
    // Create another issue via API key
    const create = await call("POST", "/api/projects/bb/issues", {
      title: "API key flow — automated by admin script",
      type: "bug",
      priority: "high",
    }, { "X-BB-API-Key": apiKey });
    s.actions.push({ type: "api", method: "POST", path: "/api/projects/bb/issues", status: create.status, result: `BB-${create.body.number}` });
    const trigger = await call("POST", "/api/workflow-runs/trigger", {
      issue_id: create.body.id,
    }, { "X-BB-API-Key": apiKey });
    s.actions.push({ type: "api", method: "POST", path: "/api/workflow-runs/trigger", status: trigger.status, response: trigger.body });
    transcript.push(s);
  }

  // ============ STEP 15: Concurrent multi-issue (scenario A) ============
  {
    const s = step("concurrent-multi-issue");
    const issues = await Promise.all([
      call("POST", "/api/projects/bb/issues", { title: "Concurrent A1", type: "task" }),
      call("POST", "/api/projects/bb/issues", { title: "Concurrent A2", type: "task" }),
      call("POST", "/api/projects/bb/issues", { title: "Concurrent A3", type: "task" }),
    ]);
    const triggers = await Promise.all(issues.map((r) =>
      call("POST", "/api/workflow-runs/trigger", { issue_id: r.body.id })
    ));
    s.actions.push({
      type: "concurrent",
      result: triggers.map((t) => t.body.status || "?"),
    });
    transcript.push(s);
  }

  await browser.close();

  // ============ Save transcript ============
  writeFileSync(resolve(OUT, "transcript.json"), JSON.stringify(transcript, null, 2));
  console.log(`\n✅ Walkthrough complete. ${stepNum} steps captured in ${OUT}`);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
