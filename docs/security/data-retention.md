# Data Retention Policy

How long Bumblebee keeps each category of data, and how it's deleted on request.

## Retention table

| Category | Retention | After expiry | Notes |
|---|---|---|---|
| User accounts | Until user-initiated deletion | Hard-delete within 30 days | Cascade to workspace_members |
| Workspaces | Until owner soft-deletes | 30 days soft → hard-delete | Cascade to all scoped data |
| Issues + events | Lifetime of workspace | Cascade-deleted with workspace | Compliance/audit access |
| Agent sessions | Lifetime of workspace | Cascade-deleted with workspace | |
| LLM call records | Lifetime of workspace | Cascade-deleted with workspace | Cost ledger |
| Audit log | Indefinite (operator may prune via SQL) | n/a in v1 | Operator policy |
| Backups | 30 days local, S3 lifecycle config (default 90d) | Auto-purge | Encrypted at rest |
| App logs | 90 days (operator-configurable) | Auto-rotate | Sentry holds errors per its plan |
| Failed payment attempts | 12 months | Auto-purge | Stripe holds canonical |
| API key hashes | Until owner revokes | Immediate on revoke | Raw key never stored |
| Invite tokens | 7 days TTL | Expired tokens prunable nightly | Manual cleanup until cron added |

## GDPR right-to-erasure flow

1. User emails `privacy@bumblebee.example.com` or owner triggers workspace delete
2. Within 30 days of request:
   - Set `users.deleted_at` + scramble PII (email → `deleted+<uuid>@deleted`, username → `deleted-<uuid>`)
   - Cascade: `workspace_members` rows removed, workspaces they own follow normal soft-delete
   - Audit events retain `actor` field but the user is no longer linkable
3. Within 90 days of request:
   - Hard-delete from primary DB
   - Backups containing the data age out within an additional 90 days

We do not retroactively scrub backups — they live within their lifecycle window encrypted, then purge. Restoration of a backup that contains deleted data is a security incident, not a retention violation.

## Workspace deletion lifecycle

```
ACTIVE
  └─► soft-delete (deleted_at = now())
        │   workspace hidden from owner's list, member access revoked
        │   issues / events / sessions still queryable via direct id for 30 days
        └─► 30 days elapsed
              │
              └─► hard-delete (DELETE FROM workspaces WHERE deleted_at < now() - 30d)
                  CASCADE removes all scoped rows
                  Backups age out per backup retention
```

The 30-day soft window exists for "I accidentally deleted my workspace" recovery. Owner can restore by emailing support during that window.

## Operator pruning recipes

```sql
-- Delete events older than 1 year
DELETE FROM events WHERE occurred_at < now() - interval '1 year';

-- Expire stale invites
DELETE FROM workspace_invites WHERE expires_at < now() AND accepted_at IS NULL;

-- Hard-delete soft-deleted workspaces past grace period
DELETE FROM workspaces WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
```

These are NOT yet automated cron jobs in v1 — operator runs them manually or via their own scheduler.

## Open

- Add cron jobs for the 3 pruning recipes above (Phase E-future)
- Audit log archival to cold storage after 12 months (not yet implemented)
- Customer-controlled retention windows (per-workspace setting) — enterprise tier, Phase F-future
