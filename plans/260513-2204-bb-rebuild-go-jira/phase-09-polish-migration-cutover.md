# Phase 09 — Polish + Migration + Cutover (W9: 2026-07-16 → 07-22)

> **Goal:** Sentry + metrics + a11y audit + perf budget enforcement; users migrated from v2; DNS flip with rollback runbook.

## Context links
- [plan.md](plan.md) §5 Migration
- All prior phases (00-08)

## Overview
- **Priority:** P0 (gates production launch)
- **Status:** pending
- **Effort:** 7 days

## Tracks (parallel)

### Track A — Polish (Days 1-4)
- Sentry wired in both Go + Next.js
- Prometheus metrics endpoint `/metrics` (request rate, errors, ws conns, queue depth)
- OpenTelemetry traces (optional, skip if time-constrained)
- Bundle analyzer enforces <250KB initial JS gzipped (CI fails if exceeded)
- Lighthouse CI runs on staging (perf >85, a11y >95)
- WCAG AA audit on all 8 routes (axe-core in CI)
- Empty states + error boundaries everywhere
- Loading skeletons match final layout (no CLS)
- Toaster for async ops (success/error toasts)
- Mobile responsive (collapse to single column <768px, no separate mobile app)

### Track B — Users migration (Day 5)
1. Production migration script (final form of Phase 01 day 4 script)
2. Dry-run on staging first: count match, password hash verification (login with old password works post-migration)
3. Edge cases:
   - Inactive users (last_login >180 days) — flag for archival but migrate
   - Deleted users — skip (no row in v3)
   - SSO users (if any) — preserve identity, may require new linkage
4. Run on prod DB during cutover window
5. Verify: log a sample of 10 users into v3 with original passwords

### Track C — Cutover (Days 6-7, weekend 2026-07-18/19 tentative)

**Pre-cutover (Day 6 — Friday)**
- Notify users by email "Bumblebee maintenance Saturday 2026-07-18 02:00–06:00 UTC"
- Final staging smoke test (full user journey)
- Backup v2 prod DB
- Tag v2 repo as `bumblebee-legacy/v2-final`

**Cutover (Day 7 — Saturday)**
1. 02:00 — Set v2 to read-only mode (block all writes via flag)
2. 02:30 — Run users migration prod
3. 03:00 — Deploy v3 prod (Coolify)
4. 03:30 — Update DNS: `bumblebee.{domain}` → v3, `legacy.bumblebee.{domain}` → v2
5. 04:00 — Smoke test: login as 3 known users, create test project + items
6. 04:30 — Enable user-visible v3 announcements
7. 05:00 — Monitor logs, error rates (Sentry)
8. 06:00 — Cutover complete OR rollback

**Rollback (if 03:00–06:00 anything goes wrong)**
- DNS revert to v2 (TTL pre-lowered to 300s = 5min propagation)
- Take v2 out of read-only
- Email users "rollback, re-scheduling"
- Cost: 1 weekend lost, no data lost (v3 data is from migration only, not user-created)

**Post-cutover (Days 8+ within 7-day rollback window)**
- Monitor error rates daily
- Hot-fix any blocker bugs
- After 7 days: rollback impractical (v3 has divergent prod data)
- After 90 days: hard-delete v2 DB and code (per plan.md open Q4)

## Implementation steps

### Day 1 — Sentry + metrics
1. `sentry-go` SDK wired into chi middleware
2. `@sentry/nextjs` integrated with App Router
3. Source maps uploaded on build
4. Prometheus metrics: `/metrics` endpoint with default + custom collectors (queue_depth, ws_conns, agent_session_duration_seconds)

### Day 2 — Perf budgets
1. `next-bundle-analyzer` in CI; assert initial JS <250KB gzipped
2. Lighthouse CI config: budgets/lighthouse-budget.json (TTI <3s, LCP <2.5s, CLS <0.1)
3. Run against staging on every PR

### Day 3 — A11y + error boundaries
1. `axe-playwright` for e2e a11y on all 8 routes
2. Fix violations (label associations, contrast, focus order, keyboard traps)
3. React Error Boundary at app root + per route
4. `_error.tsx` + Next.js error.tsx pages

### Day 4 — Empty + loading + offline
1. Empty states designed (illustration + CTA per view)
2. Skeleton loaders match real layout dimensions
3. Offline indicator (network online/offline event)
4. Optimistic-conflict toast UX

### Day 5 — Migration script + dry-run
1. Final `bb migrate-users-from-v2 --dry-run --v2-db ...`
2. Dry-run on staging clone of v2 prod data
3. Verify counts + sample login
4. Document command in runbook

### Day 6 — Pre-cutover Friday
1. Announcement emails sent
2. Staging final smoke
3. v2 backup
4. v2 tagged `bumblebee-legacy/v2-final`
5. Runbook reviewed by user (open Q3 in plan.md confirmed)

### Day 7 — Cutover Saturday
1. Execute runbook steps 1-8 above
2. Status updates in Slack/email every hour during window
3. Decide complete vs rollback at 06:00
4. Post-mortem doc started (filled Monday)

## Related files
- New: `docs/runbook-cutover.md`, `docs/runbook-rollback.md`, `cmd/bb/migrate-users-from-v2.go` (final), `internal/observability/*` (Sentry, metrics)
- Modified: every package gets error+logging polish, CI gets a11y/perf jobs

## Todo list
- [ ] Sentry wired Go + Next.js
- [ ] `/metrics` endpoint Prometheus-format
- [ ] Bundle analyzer enforces <250KB
- [ ] Lighthouse CI green
- [ ] axe-playwright green on all routes
- [ ] Error boundaries + error pages
- [ ] Empty states designed + implemented
- [ ] Migration script validated on staging
- [ ] User comms drafted + sent
- [ ] v2 backed up + tagged
- [ ] Cutover runbook reviewed + signed off
- [ ] Cutover executed
- [ ] Post-mortem written

## Success criteria (DoD)
- Sentry receives errors from both Go + Next.js in prod
- All 8 routes pass Lighthouse perf >85, a11y >95
- Initial bundle <250KB gzipped (CI enforced)
- Users from v2 can log in to v3 with original passwords (verified via sample)
- v3 prod live at `bumblebee.{domain}` with green health check
- v2 read-only at `legacy.bumblebee.{domain}` for rollback window
- No P0 bugs in first 24h post-cutover

## Risks
- **Risk:** Migration script reveals schema drift mid-cutover — mitigation: dry-run gates production run; abort if dry-run fails
- **Risk:** DNS propagation slow — mitigation: pre-lower TTL to 300s 24h before cutover
- **Risk:** Sentry rate-limited under traffic — mitigation: sample rate 0.2 in prod, 1.0 for errors
- **Risk:** Coolify deploy slow during cutover — mitigation: pre-warm image, deploy 1h before user-visible cutover

## Next steps post-cutover

**v3.1+ candidates (NOT scoped in this plan):**
- Mobile app (RN/Expo) — defer indefinitely
- GitHub/GitLab webhook integration
- Slack notifications
- Time tracking + worklog
- Reports/dashboards (burndown, velocity, cumulative flow)
- Knowledge wiki auto-generation (carry from v3 plan 260510 → research)
- Multi-tenant org switcher UI
- Two-factor auth

**Maintenance:**
- v2 stays read-only 90 days
- Monthly metrics review (perf, errors, user adoption)
- Quarterly dependency updates
