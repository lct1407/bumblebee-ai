# Incident Response

## Severities

| Sev | Definition | Response | Escalation |
|---|---|---|---|
| **S0** | Total outage · Data loss · Active breach | Page on-call within 5 min | CTO + Legal within 15 min |
| **S1** | >50% workspaces affected · Auth broken · Payment broken | On-call within 30 min | Eng lead within 1h |
| **S2** | Single feature broken · Workflow triggers fail · MCP down | < 4h business hours | Eng lead in standup |
| **S3** | Single workspace · Cosmetic · Docs error | Next business day | n/a |

## On-call rotation

- Primary: rotation across senior engineers (PagerDuty / Opsgenie)
- Secondary: backup pager (called if primary doesn't ack within 10 min)
- Manager-on-call: paged for S0 only

## Communication channels

- **Internal**: `#incidents` Slack channel
- **External**: status page (`status.bumblebee.example.com` — Phase E-future, manual updates v1)
- **Customer comms**: email blast to workspace owners on S0/S1

## Standard procedure

1. **Acknowledge** the page within SLA. Set incident status: `investigating`.
2. **Open** an incident channel (`#inc-YYYYMMDD-slug`). Roles: IC (incident commander), comms, scribe.
3. **Diagnose** — check Grafana / logs / events table. Identify the blast radius.
4. **Mitigate** — restore service first (rollback, scale, fail over). Root-cause later.
5. **Communicate** — post status updates every 30 min until resolved.
6. **Resolve** — declare resolution when service restored AND verified.
7. **Postmortem** — within 5 business days for S0/S1, blameless format, in `docs/postmortems/`.

## Common runbooks

### API 5xx surge
1. Check `/api/health` + `/api/health/db`
2. Scan logs for tracebacks → `grep ERROR /var/log/bumblebee.log | tail -100`
3. Most common: PG connection pool exhausted → restart API + tune `pool_size`
4. If LLM provider outage → flip `BUMBLEBEE_PROVIDER=stub` for graceful degradation

### Stripe webhook failures
1. Check Stripe Dashboard → Developers → Webhooks → recent attempts
2. Signature failures = rotated webhook secret without updating `.env`
3. Replay via Stripe CLI: `stripe events resend evt_XXX`

### Database outage
1. Restore from latest backup per `docs/disaster-recovery.md`
2. RTO 4h, RPO 24h on default schedule

### Suspected compromise
1. Rotate `API_SECRET_KEY` → invalidates all JWTs
2. Rotate all API keys (`UPDATE api_keys SET is_active=false`; force users to reissue)
3. Snapshot DB + logs for forensics
4. Open security@ ticket, follow vulnerability disclosure
5. If customer data exposed → notify within 72h (GDPR)

## Tools

- **Grafana**: latency, error rate, cost burn rate dashboards (Phase E-future)
- **Sentry**: error aggregation (operator install)
- **PG slow query log**: `log_min_duration_statement = 1000` (1s threshold)
- **Audit log query**: `GET /api/audit/events.json?actor=...&since=...` to investigate user actions

## Recent incidents

(none yet — this section grows as we run)
