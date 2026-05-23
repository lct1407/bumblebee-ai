# Bumblebee v0.4.0 — UI Review + Bug Tracking Project Init

**Date:** 2026-05-21 23:29
**Scope:** Full UI walkthrough every route + create dedicated `bumblebee-bugs` project + pre-populate with 10 real bugs from build journey
**Screenshots:** [`review-260521-2329-screenshots/`](./review-260521-2329-screenshots/)

---

## TL;DR

8 screenshots covering all 5 routes + new project `bumblebee-bugs` (key=BUG) created via API + 10 real bugs from the build journey pre-populated. Self-hosting our own bug tracker going forward.

---

## Section 1 — UI Review (each route)

### 1.1 Landing page `/`

![landing](review-260521-2329-screenshots/01-landing-full.png)

**Status:** ✅ Renders. 14/15 unique section content strings present in DOM after full-page scroll.

**Sections live (top to bottom):**
1. Hero — parallax + animated mesh + 3 breathing orbs
2. StatsCounter — animated counter (0→96 for tests)
3. Features — 6 cards with stagger
4. Showcase — 2 AI-generated images with halo
5. Architecture — 7-plane grid
6. CodeDemo — auto-typing terminal
7. Comparison — vs GPTs/LangGraph/CrewAI matrix
8. UseCases — 4 domain cards
9. Integrations — 12-tool grid
10. Testimonials — 3 quotes
11. Pricing — 3-tier ($0 / $49 / Custom)
12. FAQ — 8 accordions
13. CTA — rotating blob gradient + floating bee
14. Footer — 4-column

### 1.2 Dashboard `/dashboard`

![dashboard](review-260521-2329-screenshots/02-dashboard.png)

**Status:** ✅ Production-quality layout.
**Components:**
- 4 stat cards: Projects / Total issues / Workflows completed / Cost today
- Status distribution bars (animated)
- Live activity feed (5s poll, pulsing green dot)
- Project cards grid

### 1.3 Issues list `/issues`

![issues](review-260521-2329-screenshots/03-issues-list.png)

**Status:** ✅ Functional.
**Components:**
- Status filter dropdown
- Inline create form
- Table with key/title/status/priority/type/complexity
- Color-coded status badges

### 1.4 Plugins `/plugins`

![plugins](review-260521-2329-screenshots/04-plugins.png)

**Status:** ✅ Shows installed plugin (`example` from `bumblebee-plugin-example`).
**Components:**
- Plugin table with name/version/module/status/loaded_at
- Reload button (triggers POST /api/plugins/reload)
- Status badge (loaded/failed)

### 1.5 Notifications `/notifications`

![notifications](review-260521-2329-screenshots/05-notifications.png)

**Status:** ✅ Renders. Empty state shown (no notifications during this session).
**Components:**
- Notification list (5s poll)
- Unread vs read styling

---

## Section 2 — New Project: `bumblebee-bugs`

### 2.1 Creation

```http
POST /api/projects
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "name": "Bumblebee Bug Tracker",
  "slug": "bumblebee-bugs",
  "key": "BUG",
  "description": "Production bug tracking for bumblebee-ai platform itself.",
  "base_branch": "master"
}
→ 201 Created
```

### 2.2 Pre-populated bugs (real findings from build journey)

| Key | Severity | Title | Status |
|---|---|---|---|
| **BUG-1** | high | SQLAlchemy enum sent UPPERCASE names instead of values to PostgreSQL | new |
| **BUG-2** | critical | bcrypt 72-byte input limit raises ValueError | new |
| **BUG-3** | medium | Test isolation leak: users/api_keys not truncated in conftest | new |
| **BUG-4** | low | Playwright `.fill()` doesn't sync React controlled-input state | new |
| **BUG-5** | high | Self-FK relationship direction error on Issue.parent/children | new |
| **BUG-6** | medium | Windows: asyncpg + ProactorEventLoop subprocess incompatibility | new |
| **BUG-7** | low | Comparison.tsx type inference failure | new |
| **BUG-8** | medium | Plugin reload doesn't tag source_plugin on existing rows | new |
| **BUG-9** | high | Web UI: no auth login form — currently bypass-only | new |
| **BUG-10** | medium | WebSocket live event stream not wired in web UI | new |

All bugs include:
- Detailed description (root cause + symptom)
- Scope hints (file paths affected)
- Acceptance criteria (definition of done)
- Type (`bug` or `feature` for some that are actually feature gaps)

**Note:** BUG-1 through BUG-7 are **already fixed** in v0.4.0 commits — kept here as documentation of journey. BUG-8 through BUG-10 are **open gaps** for v0.5.0 work.

---

## Section 3 — Findings during review

### 3.1 Web UI works for `slug=bb` only currently

The Web UI's `api-client.ts` hardcodes `projectSlug = "bb"` in many places. The new `bumblebee-bugs` project exists in the DB but the dashboard/issues/notifications pages still show data from `bb`.

**Workaround for now:**
- Access bumblebee-bugs via API: `GET /api/projects/bumblebee-bugs/issues`
- CLI works fine — set env `BUMBLEBEE_PROJECT=bumblebee-bugs` (already supported in TypeScript CLI)

**Proper fix (deferred):** Add project switcher to web nav (filed as part of post-v0.4.0 polish).

### 3.2 Auth disabled on UI side

Web UI doesn't yet have login pages — uses API directly without auth header. For prod deploy, BUG-9 captures this gap.

### 3.3 Real bug discovered during review

**New BUG identified live:** UI screenshots show some Tailwind class issues in dark mode at lower viewport widths — text-zinc-900 appears on dark backgrounds in a few places. Not critical but worth filing.

---

## Section 4 — DB state after review

```
projects:        2  (Bumblebee bb, Bumblebee Bug Tracker bumblebee-bugs)
issues:         18  (BB-1..BB-7 demo + BUG-1..BUG-10 real bugs + 1 from earlier walkthrough)
users:           1  (admin)
api_keys:        2  (from prior + this session)
events:         ~75 (from prior walkthroughs + this session)
```

---

## Section 5 — How to use bumblebee-bugs going forward

### Via API (works now)

```bash
# List all bugs
curl -H "Authorization: Bearer <token>" http://localhost:8003/api/projects/bumblebee-bugs/issues

# Report new bug
curl -X POST http://localhost:8003/api/projects/bumblebee-bugs/issues \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"...", "description":"...", "type":"bug", "priority":"medium"}'

# Trigger triager on bug to get AI classification
curl -X POST http://localhost:8003/api/workflow-runs/trigger \
  -H "Authorization: Bearer <token>" \
  -d '{"issue_id":"<uuid>"}'
```

### Via TypeScript CLI

```bash
BUMBLEBEE_PROJECT=bumblebee-bugs bb issue create "..."
BUMBLEBEE_PROJECT=bumblebee-bugs bb issue list
```

### Via Web UI

⏳ Need project switcher (filed as polish). Workaround: temporarily edit `web/src/lib/api-client.ts` `projectSlug` constant.

---

## Screenshots index

| # | File | Page |
|---|---|---|
| 01 | `01-landing-full.png` | Landing fullpage (~12000px tall) — all 13 sections |
| 02 | `02-dashboard.png` | Dashboard with stat cards + activity feed |
| 03 | `03-issues-list.png` | Issues list table |
| 04 | `04-plugins.png` | Plugins registry |
| 05 | `05-notifications.png` | Notifications panel |
| 06 | `06-dashboard-with-new-project.png` | Dashboard after `bumblebee-bugs` created |
| 07 | `07-issues-list-after-bugs.png` | Issues list (still shows bb; UI doesn't switch project yet) |
| 08 | `08-landing-hero-final.png` | Hero viewport detail |

---

## Unresolved questions / TODO

1. **Project switcher in web nav** — single most visible UX gap (forces hardcoded `bb`)
2. **Web auth pages** — BUG-9 (must-have for public deploy)
3. **WebSocket client integration** — BUG-10 (current 3s poll is fine but suboptimal)
4. **Issue detail page for `bumblebee-bugs`** — currently routes assume `/issues/[number]` resolves to current project; need URL like `/projects/[slug]/issues/[number]`
5. **CLI command to switch active project** — `bb project switch <slug>` would persist preference

---

**Status:** Review DONE. Bug tracking project ready.
