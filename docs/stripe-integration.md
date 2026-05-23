# Stripe integration — operator guide

How to wire Stripe into Bumblebee for dev (test mode) and production (live mode).

## ⛔ Security ground rules

- **NEVER paste live keys in chat, issue, PR, or any non-secret-vault channel.** If you do, rotate immediately at https://dashboard.stripe.com/apikeys → "Roll key".
- Dev work uses **test mode** keys (`sk_test_...`, `pk_test_...`). Test mode hits the Stripe sandbox — no real money.
- Live keys go only on the production deploy target (env vars on the host), never in source control.

## What's wired today (Phase A scaffolding)

| Piece | Status |
|---|---|
| `stripe` SDK installed | ✅ |
| `Workspace.stripe_customer_id` + `stripe_subscription_id` columns | ✅ |
| `bumblebee.services.billing.stripe_client.get_stripe()` (configured guard) | ✅ |
| `bumblebee.services.billing.plans.PLANS` (free/pro/team catalog) | ✅ |
| `POST /api/stripe/webhook` endpoint + signature verification | ✅ (handlers NO-OP) |
| `scripts/stripe-setup-catalog.py` (creates Products + Prices) | ✅ |
| Live billing flow (Checkout, subscriptions, quotas, passthrough) | ⏳ Phase D |

`is_configured()` returns `False` while `STRIPE_SECRET_KEY` is empty — no live calls happen until you flip both `STRIPE_SECRET_KEY` and `BILLING_ENABLED=true`.

## Dev setup (test mode)

### 1. Get test keys

In the Stripe Dashboard, top-right toggle says "Test mode" (orange). Switch to test mode → Developers → API keys. Copy:

- **Secret key** — starts with `sk_test_...`
- **Publishable key** — starts with `pk_test_...`

### 2. Drop into `.env`

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
BILLING_ENABLED=false   # leave false until Phase D Checkout is wired
```

`BILLING_ENABLED=false` means: webhook endpoint still verifies signatures (so the wiring is testable), but the harness skips quota enforcement and no Checkout sessions are created.

### 3. Create Products + Prices (one-shot)

```bash
python scripts/stripe-setup-catalog.py
```

Idempotent — re-runs safely. Prints the Price IDs at the end:

```env
STRIPE_PRICE_PRO_ID=price_1Q...
STRIPE_PRICE_TEAM_ID=price_1Q...
STRIPE_PRICE_TEAM_USAGE_ID=price_1Q...
```

Paste them into `.env`.

### 4. Local webhook forwarding

Stripe CLI is required for local dev because Stripe can't reach your laptop:

```bash
# Install: https://stripe.com/docs/stripe-cli
stripe login

# Forward webhook events to your local server
stripe listen --forward-to localhost:8000/api/stripe/webhook
```

The CLI prints a webhook signing secret like `whsec_...`. Add to `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Trigger a test event:

```bash
stripe trigger customer.subscription.created
```

Watch your server logs — should see `[phase A noop] subscription_created ...`.

## Phase D activation (later)

When Phase D begins (week 8):

1. Set `BILLING_ENABLED=true` in `.env` (dev) — enables `get_stripe()` calls
2. Fill in the 5 webhook handlers in `bumblebee/routers/stripe_webhooks.py`
3. Add `POST /api/workspaces/{ws}/checkout-session` (returns Checkout URL)
4. Add quota check in `harness.run_role()` (read workspace.plan from DB, gate trigger)
5. Add usage reporter in `harness._on_llm_call()` for team-plan workspaces
6. Add invoice list/PDF endpoints

## Production setup (live mode)

Same as dev but:

- `STRIPE_SECRET_KEY=sk_live_...` (live key from Dashboard live mode)
- `STRIPE_PUBLISHABLE_KEY=pk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...` from the Dashboard webhook config (NOT from `stripe listen`)
- Register the webhook endpoint URL in Dashboard → Developers → Webhooks: `https://api.bumblebee.example.com/api/stripe/webhook`, subscribe to the 5 events the dispatcher cares about (`customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`)
- `BILLING_ENABLED=true` (once Phase D is shipped)
- Use Stripe Tax for automatic VAT/GST handling

## Operational notes

- **Idempotency**: every Stripe mutation uses `new_idempotency_key()` so safe retries don't double-charge.
- **API version**: pinned to `2024-12-18.acacia` — bump only with deliberate testing.
- **Lost webhooks**: on server boot Phase D will reconcile via `stripe.Subscription.list(...)` to catch up after downtime.
- **Refunds + dunning**: handled by Stripe's smart retries + Customer Portal (we don't build self-serve cancellation in v1).
- **Audit trail**: every webhook event also appends to our `events` table as `subscription_*` / `invoice_*` events so the workspace's audit log shows billing activity alongside agent activity.

## Unresolved

- Tax handling: enable Stripe Tax before charging live customers (auto VAT/GST registration thresholds)
- Refund policy: declared in `docs/security/sla.md` (Phase E)
- Currency: USD only at launch; multi-currency Phase F+1
