# Phase D — Stripe billing + quotas

## Context

- Plan: [plan.md](plan.md)
- Depends on: Phase A (workspace_id + `stripe_customer_id` column)
- Stripe scaffolding already done in Phase A weeks 1-2 (SDK, catalog, webhook skeleton)

## Overview

| | |
|---|---|
| Priority | 🔴 Critical — revenue path |
| Status | pending |
| Weeks | 8-9 |
| Brief | Flip Stripe scaffolding to live: workspace creation → Stripe Customer; subscribe via Checkout; per-workspace quota enforcement; invoice export. Three tiers (free, pro $20/mo per seat, team $100/mo + LLM cost passthrough). |

## Key Insights

- Phase A built the rails (SDK, catalog, webhook handler skeleton). Phase D fills in handlers + creates the customer linkage + enforces quotas.
- Use **Stripe Checkout** (hosted) not Stripe Elements — saves 1-2 weeks of UI work.
- LLM cost passthrough = team tier passes the raw LLM dollar cost through as an extra line item (Stripe metered billing).
- Quotas enforced at workspace level (e.g., $50/mo on free tier) separate from per-issue budget gate already shipped.

## Requirements

### Functional
- Three plans visible on pricing page:
  - **Free**: 1 workspace, 5 active issues, $1/mo LLM budget
  - **Pro $20/mo per seat**: 5 workspaces, unlimited issues, $20/mo LLM budget per seat
  - **Team $100/mo + passthrough**: unlimited workspaces + issues, no LLM cap (passthrough)
- Signup flow (week 1 path):
  - User registers → workspace created → Free plan auto-attached → Stripe Customer created (no card yet)
- Upgrade flow:
  - Workspace owner clicks "Upgrade" in Settings → Billing → Stripe Checkout opens → on success, webhook sets `workspace.plan` + `workspace.stripe_subscription_id`
- Webhook handlers (filled in this phase):
  - `customer.subscription.created` → activate plan
  - `customer.subscription.updated` → re-sync plan/status
  - `customer.subscription.deleted` → revert to Free
  - `invoice.paid` → emit `subscription_paid` event for audit
  - `invoice.payment_failed` → emit + mark workspace `payment_overdue` (read-only mode after 7 days)
- Quota enforcement:
  - Before workflow trigger → check `workspace.llm_spend_cents_this_period < workspace.plan.llm_cap_cents`
  - If over → 402 with upgrade link
- LLM cost passthrough (team tier):
  - After every `llm_call` event, increment Stripe metered usage record
  - Stripe handles aggregation + monthly invoice line item
- Invoice export:
  - `GET /api/workspaces/{ws}/invoices` → list from Stripe API
  - `GET /api/workspaces/{ws}/invoices/{id}.pdf` → proxy Stripe hosted invoice URL

### Non-functional
- Webhook signature verification mandatory (already done in scaffolding)
- Idempotent handlers (use `event.id` for dedup)
- Quota check < 10ms (cached counter in Redis OR computed from events table with index)
- Failed payment retries follow Stripe's smart retry by default

## Architecture

```
Web UI: /settings/billing
  └─► POST /api/workspaces/{ws}/checkout-session
        ├─► stripe.checkout.Session.create(...)
        └─► returns session.url → redirect

Stripe ─► POST /api/stripe/webhook (signature verified, dispatch on event.type)
  ├─► customer.subscription.* → update workspace.plan, .stripe_subscription_id
  ├─► invoice.paid → append_event("subscription_paid")
  └─► invoice.payment_failed → mark workspace.payment_overdue

Harness (per llm_call):
  └─► quota_check(workspace) → ok | 402
  └─► if team plan: stripe.SubscriptionItem.create_usage_record(...)
```

## Related Code Files

### Create
- `bumblebee/services/billing/plans.py` — plan definitions (free/pro/team) with caps + price IDs
- `bumblebee/services/billing/quota.py` — `check_workspace_quota`, `record_usage`
- `bumblebee/services/billing/usage_reporter.py` — pushes metered usage to Stripe
- `bumblebee/routers/billing.py` — checkout-session endpoint, invoices endpoints
- `web/src/app/(app)/settings/billing/page.tsx`
- `web/src/app/(public)/pricing/page.tsx` (or extend existing landing)
- `alembic/versions/20260720_0001_workspace_plan_columns.py` — add `plan`, `payment_overdue`, `llm_spend_cents_this_period`, `period_started_at`
- `docs/billing.md` — pricing model, tax handling note, refund policy

### Modify
- `bumblebee/routers/stripe_webhooks.py` — fill in handlers
- `bumblebee/services/execution/harness.py` — quota check + usage record
- `bumblebee/services/safety/budget_enforcer.py` — recognise workspace plan caps in addition to per-issue
- `web/src/components/app/sidebar.tsx` — show "Upgrade" prompt when on free + near limit
- `bumblebee/services/state/event_log.py` — new event types: `subscription_created`, `subscription_canceled`, `payment_failed`, `quota_exceeded`

## Implementation Steps

1. **Plan catalog code** — `PLANS = {"free": Plan(...), "pro": Plan(...), "team": Plan(...)}` matching the Stripe Dashboard Price IDs from Phase A scaffolding.
2. **Workspace columns migration** — `plan` enum, `payment_overdue` bool, `llm_spend_cents_this_period` int, `period_started_at` timestamp.
3. **Checkout session endpoint** — `POST /api/workspaces/{ws}/checkout-session` with body `{plan: "pro"}`. Creates session with `success_url=/settings/billing?status=success&session={CHECKOUT_SESSION_ID}` and `cancel_url=/settings/billing?status=cancel`.
4. **Webhook handlers** — fill in the 5 events listed in Requirements. Idempotent (check `processed_webhooks` table).
5. **Quota enforcement** — `check_workspace_quota(db, workspace_id)`:
   - Free: monthly spend < $1, max 5 active issues
   - Pro: monthly spend < $20/seat
   - Team: no cap; usage reporter pushes to Stripe
   - Use indexed query on `events` table for spend sum; cache 60s if hot.
6. **Usage reporter** — async background task or post-event hook: on `llm_call` event for team plan, call `stripe.SubscriptionItem.create_usage_record(...)` with idempotency key.
7. **Billing UI** — settings/billing page shows current plan, monthly spend, next invoice, "Upgrade" / "Cancel" buttons. List recent invoices.
8. **Pricing page** — extend existing landing's pricing section to link "Sign up + Pro" → after register, auto-trigger Checkout for Pro plan.
9. **Period reset** — daily cron: workspaces past `period_started_at + 1 month` → reset `llm_spend_cents_this_period` to 0, bump `period_started_at`.
10. **Failed payment grace** — `payment_overdue=true` for 7 days → workspace becomes read-only (workflows blocked, can still read).
11. **Tests** — pytest: webhook signature verify, idempotent handlers, quota gate, plan upgrade flow.
12. **E2E** — Playwright + Stripe test cards: full upgrade flow, payment success, payment failure, period reset.

## Todo

- [ ] Plan catalog code matches Stripe Dashboard
- [ ] Workspace plan/quota columns shipped
- [ ] Checkout session endpoint
- [ ] All 5 webhook handlers idempotent + verified
- [ ] Quota check on harness
- [ ] Usage reporter for team plan
- [ ] Settings billing UI
- [ ] Pricing page wired
- [ ] Period reset cron
- [ ] Failed payment grace mode
- [ ] Tests + E2E

## Success Criteria

- ✅ Free user can upgrade to Pro via Checkout (test card 4242)
- ✅ Pro user can downgrade to Free at period end
- ✅ Team plan emits Stripe metered usage on every LLM call
- ✅ Quota exceeded returns 402 with upgrade link
- ✅ Failed payment marks workspace read-only after 7 days
- ✅ Invoice list + PDF download works
- ✅ Webhook handler is idempotent (replay same event → no double-charge)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Webhook lost (server down) | Med | High | Stripe retries; on startup, run "catch-up" reconcile via `stripe.Subscription.list` |
| Race: signup creates customer, signup transaction rolls back | Low | Med | Customer creation in post-commit hook only; OR clean up orphan customers in nightly job |
| Usage report fails mid-month | Med | Med | Retry with exponential backoff; alert if > 100 in retry queue |
| Tax calculation (VAT/GST) | High | High | Use Stripe Tax (auto); document tax registration thresholds |
| Pro plan abuse (one seat, 100 workspaces) | Med | Low | Enforce seat × workspace ratio in API |

## Security Considerations

- Webhook signature MUST be verified (already in scaffolding)
- `payment_overdue` workspace cannot create issues — verify enforcement covers MCP tools too
- Never log raw card data (Stripe Checkout = we never see it)
- Invoice PDF URLs are Stripe-hosted, signed; proxy via short-lived redirect

## Next Steps

- **Depends on**: Phase A (workspace.stripe_customer_id), Stripe scaffolding from Phase A weeks 1-2
- **Blocks**: nothing
- **Unlocks**: First recurring revenue
