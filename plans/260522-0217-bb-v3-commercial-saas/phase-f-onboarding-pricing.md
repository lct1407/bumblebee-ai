# Phase F — Onboarding + pricing + first-paid

## Context

- Plan: [plan.md](plan.md)
- Depends on: A, B, D (auth/billing/MCP), E (changelog modal pattern)

## Overview

| | |
|---|---|
| Priority | 🟠 Medium — polish for conversion |
| Status | pending |
| Weeks | 12 |
| Brief | Smooth the first-30-seconds experience: workspace creation wizard, invite team, first-issue tour, public pricing page wired to Stripe Checkout. Goal: ≥60% of signups create a workspace + 1 issue + 1 workflow trigger within 24h. |

## Key Insights

- Today: user signs up → lands on cold dashboard with empty state. High bounce risk.
- Industry norm (Linear, Notion, Vercel): 3-step wizard within 60s of signup.
- Pricing page MUST exist before any paid marketing campaign.
- Empty dashboard needs a "start here" card pointing to the wizard.

## Requirements

### Functional
- **Onboarding wizard** at `/onboard` (gated to users without active workspace OR via banner on dashboard):
  - Step 1: Create workspace (name, slug auto-derived)
  - Step 2: Invite team (skip-able; sends email invites)
  - Step 3: Create first issue from a template (5 templates: "Fix bug", "Add feature", "Run analysis", "Update docs", "Empty")
  - Step 4: Trigger first workflow on the new issue (auto, with progress)
- **Pricing page** at `/pricing` (public):
  - 3 plan cards (Free, Pro, Team)
  - Feature comparison table
  - FAQ section
  - "Get started" CTA per tier → register flow with `?plan=pro` prefill
- **First-issue tour** (in-app, after wizard):
  - Tooltip walkthrough: Status badge → Activity tab → Trigger workflow → Live stream panel
  - 4 steps, ESC to skip
- **Empty-state nudges** on Dashboard, Issues list, Plugins:
  - Each empty state has primary CTA matching what's missing

### Non-functional
- Wizard < 60 seconds to complete (skipping team invite)
- Pricing page Lighthouse score ≥ 95
- Wizard state persisted (refresh-safe)

## Architecture

```
POST /api/auth/register
  → user created
  → if ?plan=pro: redirect /onboard?plan=pro (forces Checkout in step 5)
  → else:        redirect /onboard

/onboard
  ├── Step 1: Create workspace (POST /api/workspaces)
  ├── Step 2: Invite team   (POST /api/workspaces/{ws}/invites × N)
  ├── Step 3: Pick template + create issue (POST /api/projects/{ws-default}/issues with template body)
  ├── Step 4: Trigger workflow (POST /api/workflow-runs/trigger)
  └── (if plan=pro) Step 5: Stripe Checkout
```

## Related Code Files

### Create
- `web/src/app/(public)/pricing/page.tsx`
- `web/src/app/onboard/page.tsx`
- `web/src/components/onboard/wizard.tsx`
- `web/src/components/onboard/step-create-workspace.tsx`
- `web/src/components/onboard/step-invite-team.tsx`
- `web/src/components/onboard/step-first-issue.tsx`
- `web/src/components/onboard/step-trigger-workflow.tsx`
- `web/src/components/onboard/tour-tooltip.tsx`
- `web/src/lib/issue-templates.ts` — 5 templates (title + sectioned description)

### Modify
- `web/src/app/(app)/dashboard/page.tsx` — show "Start your tour →" banner if user hasn't completed onboarding
- `web/src/app/(public)/page.tsx` — landing's pricing section now links to `/pricing`
- `web/src/components/ui/skeleton.tsx::EmptyState` — already has `action` prop; ensure every consumer page provides one

## Implementation Steps

1. **Issue templates** — 5 markdown templates with sections pre-filled.
2. **Wizard shell** — 4-step component with progress dots, back/next buttons, step-state in URL search params.
3. **Step 1** — workspace form, validate slug uniqueness via debounced API call.
4. **Step 2** — email invite list (chips), skip button.
5. **Step 3** — template picker (cards), customize title, submit.
6. **Step 4** — trigger workflow; show live stream panel (reuses `LiveStream` component); on `stream_ended` event, advance.
7. **Conditional Step 5** (paid plans) — Checkout redirect.
8. **Tour tooltip** — Floating UI to anchor on key elements; 4-step sequence; ESC dismisses.
9. **Pricing page** — 3 cards from `services/billing/plans.py` data exported; FAQ from CMS-style YAML.
10. **Empty-state nudges** — audit existing empty states; ensure all have CTA + (where relevant) link to onboarding.
11. **Analytics** — fire events on each wizard step completion (Posthog/Plausible) → measure funnel.
12. **E2E** — Playwright: register → complete wizard → first issue created → workflow triggered.

## Todo

- [ ] 5 issue templates
- [ ] Wizard shell + 4 steps
- [ ] Slug uniqueness check
- [ ] Email invite list UI
- [ ] Template picker
- [ ] Live trigger using existing `LiveStream`
- [ ] Conditional Checkout step
- [ ] First-issue tooltip tour
- [ ] Pricing page
- [ ] Empty-state CTAs audited
- [ ] Analytics events on wizard funnel
- [ ] E2E test passes
- [ ] Lighthouse ≥ 95 on pricing

## Success Criteria

- ✅ ≥60% of new signups complete onboarding (workspace + 1 issue + 1 trigger) within 24h (measured at week 14 of v1 launch)
- ✅ Pricing page Lighthouse ≥ 95 (perf/SEO/a11y)
- ✅ Wizard skipping path (free user, no team) completes in < 60s
- ✅ Paid signup path lands user on Stripe Checkout within 90s of registration
- ✅ Empty-state CTAs lead to first action in < 2 clicks

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Wizard feels too long | Med | High | Each step optional; skip buttons; analytics tracks drop-off per step |
| Stripe Checkout abandon | High | High | "Skip for now" → defer to Free; remind on next visit |
| Slug collisions in step 1 | Med | Low | Debounce check; suggest variant |
| Live stream demo fails on signup machine (no claude key) | Med | Med | Stub provider fallback emits synthetic chunks for demo purposes |

## Security Considerations

- Invite emails sent server-side via SES/Postmark; verify SPF/DKIM before launch
- Onboarding endpoints rate-limited (10/min per IP) to prevent spam workspace creation
- Slug user input sanitized (no XSS in workspace name display)

## Next Steps

- **Depends on**: A, B, D, E
- **Blocks**: nothing
- **After Phase F**: launch v1.0 → measure funnel → iterate
