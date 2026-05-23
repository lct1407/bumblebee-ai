# Getting started with Bumblebee — step-by-step user guide

This guide walks you from landing page to your first running workflow in about 5 minutes. Every step has a screenshot captured from an actual E2E test run.

> **Self-host or Cloud?** This guide assumes Bumblebee Cloud (or a self-host running at `localhost:3000`). For installation, see `docs/getting-started.md`.

## Prerequisites

- Modern browser (Chrome / Firefox / Safari / Edge)
- Email address (or Google account for one-click sign-in)
- 5 minutes

---

## 1. Landing page

Open Bumblebee in your browser. You'll see the marketing landing page.

![Landing page](./guide-screenshots/01-landing-page.png)

Click **Pricing** in the header to choose a plan, or jump straight to **Sign up** if you already know you want the Free tier.

---

## 2. Pick a plan (pricing page)

Three tiers:

| Plan | Best for | LLM budget |
|---|---|---|
| **Free** | Trying it out, solo experimentation | $1/mo cap |
| **Pro** ($20/mo per seat) | Real workloads, MCP + Claude Code integration | $20/mo per seat |
| **Team** ($100/mo + passthrough) | Teams, audit/SOC2 needs | unlimited (metered) |

![Pricing page](./guide-screenshots/02-pricing-page.png)

Click **Start free** (or **Upgrade to Pro / Talk to us**). For paid tiers you'll be sent to Stripe Checkout after onboarding — for Free you go straight in.

---

## 3. Create your account

The register form needs three things:

- **Username** (3+ chars, alphanumeric)
- **Email**
- **Password** (8+ chars)

![Register — empty form](./guide-screenshots/03-register-empty.png)

Or click **Continue with Google** to sign up with one click (operator must have configured `GOOGLE_CLIENT_ID` — see `docs/security/google-oauth-setup.md`).

Fill it out:

![Register — filled](./guide-screenshots/04-register-filled.png)

Hit **Create account**. You're redirected into onboarding.

---

## 4. Onboarding wizard (4 steps · ~60 seconds)

### 4.1 — Create your workspace

A workspace is your top-level container — it holds projects, issues, team members, and billing. You'll usually only need one.

![Onboard step 1 — workspace name](./guide-screenshots/05-onboard-step1-workspace.png)

Give it a display name (you can rename later). The slug is auto-generated.

### 4.2 — Invite your team

Type teammate emails one at a time, press Enter to add. They'll get an email invite with a join link (skip if solo).

![Onboard step 2 — invites](./guide-screenshots/06-onboard-step2-invites.png)

**Tip:** You can also share the invite link directly from `Settings → Members` later.

### 4.3 — Create your first issue from a template

Five templates: Fix bug · Add feature · Refactor · Investigate · Blank. Each pre-fills the description with the right sections.

![Onboard step 3 — pick template](./guide-screenshots/07-onboard-step3-templates.png)

Pick **Add: feature** to follow this guide:

![Onboard step 3 — feature picked](./guide-screenshots/08-onboard-step3-feature-picked.png)

Customize the title, then click **Create issue**.

### 4.4 — Confirmation

![Onboard step 4 — confirmation](./guide-screenshots/09-onboard-step4-complete.png)

You're set up. For paid plans the next button takes you to Stripe Checkout; for Free it takes you to the dashboard.

---

## 5. The dashboard

Your home base — workflow throughput, LLM cost, status mix, recent activity, projects, recently-updated issues.

![Dashboard](./guide-screenshots/10-dashboard.png)

The sidebar gives you:

- **Workspace switcher** (top) — change workspace
- **Project switcher** — change project within a workspace
- **Search (⌘K)** — command palette (see step 10)
- **Workspace nav**: Dashboard · Inbox
- **Project nav**: All issues · Active · Closed · Failed (with badge counts)
- **System nav**: Plugins
- **Theme toggle** (footer)

---

## 6. Issues list

Click **All issues** (or **Issues** in nav).

![Issues list](./guide-screenshots/11-issues-list.png)

Features:

- **3 views**: List · Board · Stats — toggle with the segmented control on the toolbar
- **Filters**: Status / Priority / Type — multi-select comboboxes
- **Search** by title
- **Column visibility**: click "9 selected" to hide/show columns
- **Click a row** to open the quick-edit detail sheet, or the title to navigate to the full page

---

## 7. Issue detail

Click any issue row to open the slide-in **detail sheet**:

![Issue detail sheet](./guide-screenshots/12-issue-detail-sheet.png)

For the full-page view (with Activity + Runs tabs), click "Open full detail page →" or navigate directly:

![Issue detail page](./guide-screenshots/13-issue-detail-page.png)

Three tabs:

- **Overview** — description, acceptance criteria (interactive checklist), bug diagnostics (for bug type), AI summary, scope hints
- **Activity** — timeline of every event (status changes, LLM calls with cost, tool uses, decisions). Grouped by day.
- **Runs** — workflow runs aggregated from events with status, LLM calls, total cost, duration

Right sidebar shows live metadata (status / priority / type / workflow stats / scope hints).

### 7.1 — Trigger a workflow

Click **Trigger workflow** (top right of detail page) to run the default `simple-fix-flow`. Switch to the **Activity** tab to watch events stream in real time:

![Activity tab](./guide-screenshots/14-issue-activity-tab.png)

The live panel at the top of Activity shows token-by-token streaming from Claude CLI (when `BUMBLEBEE_PROVIDER=claude-cli`).

---

## 8. Workspace settings · Members

Go to `Settings → Members` (sidebar bottom or via the workspace switcher).

![Members page](./guide-screenshots/15-settings-members.png)

Roles: **owner** · **admin** · **member** · **viewer**. Admins+ can invite, change roles, remove (owner immune). On invite, you get a shareable URL as fallback if email delivery fails.

---

## 9. Billing

`Settings → Billing` shows your plan + live usage meter + invoice history.

![Billing page](./guide-screenshots/16-settings-billing.png)

On the Free plan you see the upgrade cards. After upgrading to Pro:

- Hosted Stripe Checkout opens for card details
- On success, webhook updates `workspace.plan` to `pro`
- Quota cap lifts from $1 to $20/seat/month
- Usage meter color-shifts green → amber → red at 70 / 90% of cap

Cancel-at-period-end is available to owners; you keep access until your current cycle ends, then drop to Free.

---

## 10. Power user: Command palette

Press `Cmd+K` (Mac) or `Ctrl+K` (Win/Linux) from anywhere in the app.

![Command palette](./guide-screenshots/17-command-palette.png)

Navigate · jump to issue · switch project · trigger actions. Fuzzy-search across the catalog.

Keyboard shortcuts:
- `↑ ↓` navigate · `↵` select · `Esc` close
- `G D` (in palette) → Dashboard · `G I` → Issues · etc.

---

## 11. Sign back in

Sign out, then sign back in via `/login`:

![Login page](./guide-screenshots/18-login-page.png)

Username + password OR Google. Token persists in `localStorage` until you click sign out.

---

## What's next?

- **MCP integration** → `docs/mcp-integration.md` — wire Bumblebee into Claude Code / Desktop / Cursor
- **Streaming architecture** → `docs/streaming-architecture.md` — how live agent output reaches the UI
- **Design system** → `docs/design-system.md` — tokens, components, theme rules
- **Security policy** → `docs/security/security-policy.md` — what's encrypted, what's logged
- **Disaster recovery** → `docs/disaster-recovery.md` — backup + restore procedures
- **Pricing details** → `docs/billing.md` (TBD) — full breakdown of metered usage

## Troubleshooting

| Symptom | Fix |
|---|---|
| Register returns 409 | Username taken — try a different one |
| Google sign-in says "google_oauth_not_configured" | Operator: set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env`, restart API |
| Workflow trigger returns 402 | Plan budget exceeded — upgrade or wait for monthly reset |
| Workspace switcher empty | New account — refresh or revisit `/onboard` |
| Activity tab shows no events | Workflow hasn't been triggered yet — click "Trigger workflow" |
| Sign-in works but redirects to /login | `API_SECRET_KEY` changed → all sessions invalidated; clear cookies + re-login |
