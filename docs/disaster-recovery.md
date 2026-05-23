# Disaster Recovery Runbook

How to back up and restore Bumblebee data.

## Objectives

| Metric | Target |
|---|---|
| **RTO** (Recovery Time Objective) | 4 hours from incident declared → service restored |
| **RPO** (Recovery Point Objective) | 1 hour max data loss (in practice ~24h on default schedule) |

## What's backed up

- **PostgreSQL database** — full dump including all workspaces, issues, events, sessions, knowledge, agent definitions, workflows, plugin registrations, API keys (hashed).
- **`.env` configuration** — secrets backup is YOUR responsibility (1Password / Vault / KMS); the scripts do not include `.env`.
- **Worktrees** (`~/.bumblebee/worktrees/`) — NOT backed up. They are ephemeral by design (re-created from issue + git branch on next agent run).

## Scheduled backup

```bash
# crontab -e
0 3 * * * cd /opt/bumblebee && ./scripts/backup.sh s3://bumblebee-backups/prod >> /var/log/bumblebee-backup.log 2>&1
```

Or write to local disk:

```bash
0 3 * * * cd /opt/bumblebee && BUMBLEBEE_BACKUP_PATH=/srv/backups ./scripts/backup.sh
```

Optional encryption (recommended for off-host backups):

```bash
GPG_RECIPIENT=ops@bumblebee.example.com ./scripts/backup.sh s3://bumblebee-backups/prod
```

The script handles:
- `pg_dump` → gzip → (optional GPG) → destination
- 30-day local retention (S3 lifecycle handles S3 retention)
- Logs to stdout (cron captures to log file)

## Manual one-off backup

```bash
./scripts/backup.sh ./backups
# creates ./backups/bumblebee-20260522-030000.sql.gz
```

## Restore procedure

⚠ **Destructive** — drops + recreates schema in target database.

```bash
./scripts/restore.sh backups/bumblebee-20260522-030000.sql.gz
# Prompts for database name to confirm. Aborts on mismatch.
```

From S3:
```bash
./scripts/restore.sh s3://bumblebee-backups/prod/bumblebee-20260522-030000.sql.gz
```

After restore:
1. `alembic upgrade head` — bring schema to current revision (in case backup is from older code)
2. Run `python -m bumblebee.prompts.validator` to verify config integrity
3. Restart the API server + CLI daemon
4. Sanity-check via `GET /api/health/db`

## Quarterly DR test (operator responsibility)

1. Snapshot prod backup
2. Restore to a clean staging database
3. Run `pytest tests/` against staging
4. Verify a known workspace's issue count + 1 sample workflow trigger
5. Time the full procedure — must be < 4h end-to-end

## Incident severity ladder

| Severity | Definition | Response time |
|---|---|---|
| **S0** | Total outage, data loss, or security breach | Immediate (page on-call) |
| **S1** | Major degradation (>50% of workspaces affected) | < 30 min |
| **S2** | Single feature broken (e.g. workflow triggers fail) | < 4h business hours |
| **S3** | Cosmetic / single workspace / docs | Next business day |

## Backup health check

Run weekly:

```bash
# Verify the most recent backup is < 25 hours old
LATEST=$(aws s3 ls s3://bumblebee-backups/prod/ | sort | tail -1)
echo "$LATEST"
# Should match today or yesterday's date.

# Verify the dump is restoreable (cheap sanity check):
./scripts/restore.sh s3://bumblebee-backups/prod/<latest>.sql.gz
# in a STAGING database, never prod
```

## Failure scenarios

| Scenario | Mitigation |
|---|---|
| PG instance dies | Restore latest backup → fail over DNS to standby host |
| Region outage | Restore from S3 (cross-region replicated) to fallback region |
| Bad migration | `alembic downgrade -1` if reversible; else restore + replay events forward |
| Accidental `DROP TABLE` | Restore from latest backup, lose at most 24h of data |
| Ransomware on backup host | Off-host encrypted S3 backup recoverable |
| Lost JWT secret key | Rotate `API_SECRET_KEY`, all sessions invalidated, users re-login |

## Secret rotation

`.env.example` ships with empty placeholders. Production `.env` must replace
every placeholder with a freshly generated value **before** the first boot
against real traffic. Treat any leak (laptop loss, repo accident, CI dump,
ex-employee with `.env` access) as cause for immediate rotation.

| Secret | Source of truth | How to generate / fetch |
|---|---|---|
| `API_SECRET_KEY` | self-issued (JWT signing) | `openssl rand -hex 32` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard | Developers → Webhooks → endpoint → "Reveal signing secret" |

### Rotate `API_SECRET_KEY`

JWTs are signed with this key. Rotation invalidates every active session.

```bash
NEW_KEY=$(openssl rand -hex 32)
# 1. Stage in secret store (1Password / Vault / KMS), not the repo.
# 2. Update prod .env (or k8s Secret), then:
sudo systemctl restart bumblebee-api  # or: kubectl rollout restart deploy/bumblebee-api
# 3. Confirm via: curl -s https://api.bumblebee.example.com/api/health
# 4. Announce forced re-login in #status — users see 401 on next request.
```

Rotate at least every 90 days, and immediately on any suspected exposure.

### Rotate `STRIPE_WEBHOOK_SECRET`

Stripe issues the signing secret per webhook endpoint. Rotation is a
Dashboard action, not an `openssl` call.

1. Stripe Dashboard → **Developers → Webhooks** → select the
   `https://api.bumblebee.example.com/api/stripe/webhook` endpoint.
2. Click **Roll secret**. Choose an overlap window (recommended: 24h) so the
   old secret keeps verifying while you deploy the new one.
3. Copy the new `whsec_...` into the secret store, update prod `.env`, restart
   the API.
4. Send a test event from the Dashboard (`Send test webhook`) and confirm a
   `200` in the API logs. Investigate any `400 invalid signature` before the
   overlap window closes.
5. Once verified, expire the old secret from the Dashboard.

If the secret is suspected leaked, roll **without** an overlap window — the
short window of webhook failures is preferable to accepting forged events.

### Rotation cadence

| Secret | Routine | Trigger-based |
|---|---|---|
| `API_SECRET_KEY` | every 90 days | leak, ex-staff with `.env`, repo exposure |
| `STRIPE_WEBHOOK_SECRET` | annually | leak, Stripe security advisory, endpoint URL change |

Log each rotation in the ops journal with date, operator, and reason.

## Unresolved

- WAL archiving + point-in-time recovery (PITR) not yet enabled — Phase E-future
- Standby replica failover automation not yet scripted
- S3 cross-region replication policy not codified (do manually in Dashboard for now)
