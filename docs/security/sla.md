# Service Level Agreement

Applies to **Bumblebee Cloud** (the SaaS product). Self-hosted deployments are not covered.

## Uptime commitment

| Tier | Uptime SLO | Monthly downtime budget |
|---|---|---|
| **Free** | Best-effort | n/a |
| **Pro** | 99.5% | ~3.6 hours |
| **Team** | 99.9% | ~43 minutes |

Measured over rolling calendar months. Excludes scheduled maintenance (announced ≥72h in advance).

## Service credits

If we miss the SLO in a calendar month, paying customers receive credit on next invoice:

| Actual uptime | Pro credit | Team credit |
|---|---|---|
| 99.0% – 99.5% | 10% | 10% |
| 95.0% – 99.0% | 25% | 25% |
| < 95.0% | 50% | 50% |

To claim: email billing@bumblebee.example.com within 30 days of the affected month. Credits are not refundable.

## What counts as downtime

- API returns ≥ 50% 5xx responses for ≥ 5 consecutive minutes
- Web UI fails to load `/dashboard` for ≥ 5 consecutive minutes
- Workflow triggers fail for ≥ 50% of attempts for ≥ 15 minutes

Does NOT count:
- LLM provider outages outside our control (we surface gracefully via `BUMBLEBEE_PROVIDER=stub` fallback)
- Customer-caused: bad payloads, quota exceeded, expired payment
- Scheduled maintenance (announced)
- Force majeure

## Response time targets

| Severity | Target ack | Update cadence |
|---|---|---|
| **S0** outage | 15 min | every 30 min |
| **S1** major | 1h | every 1h |
| **S2** | 4h business | daily |
| **S3** | next business day | n/a |

Pro: email support only (48h business hours)
Team: priority support (24h business hours, dedicated channel)

## Maintenance windows

- **Scheduled**: announced ≥ 72h in advance via status page + email to workspace owners
- **Emergency**: as needed for critical security patches — communicated as soon as practical

## Status page

`https://status.bumblebee.example.com` (Phase E-future, manual updates in v1).

## Termination

Either party may terminate with 30 days notice. Customer data retained 90 days after termination for restore, then hard-deleted (GDPR compliant).

## Limits of liability

Maximum aggregate liability = 12 months of fees paid. No liability for consequential or indirect damages. Full terms in the Terms of Service.

## Changes

Bumblebee may revise this SLA with 30 days notice. Material reductions require active consent for renewals.
