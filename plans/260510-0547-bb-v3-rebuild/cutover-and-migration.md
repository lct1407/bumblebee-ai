# Cutover & Migration — v2 → v3

## Context Links
- [plan.md](plan.md)
- [phase-00-bootstrap.md](phase-00-bootstrap.md)
- [research/bb-v2-critical-audit.md](research/bb-v2-critical-audit.md)

## Overview
- **Cutover window:** 2026-07-13 → 2026-07-19 (Week 9, after Phase 08)
- **Strategy:** Dual-run staging + opt-in prod migration. v2 stays live until v3 has 7 consecutive days of green production usage.
- **Migration scope:** `users` only. Everything else greenfield. v2 tasks/work_items are NOT migrated (audit-only via legacy archive).

## Timeline

| Week | Date | Milestone |
|---|---|---|
| W0 | 2026-05-11 → 05-17 | Phase 00 (bootstrap). v3 staging idle. |
| W1–W8 | 2026-05-18 → 2026-07-12 | Phases 01–08 ship to v3 staging. v2 prod untouched. |
| W9-a | 2026-07-13 → 07-15 | Soak: v3 prod live in parallel. Real usage on v3 only by maintainer. |
| W9-b | 2026-07-16 → 07-17 | Migrate `users` from v2 prod DB → v3 prod DB. Re-issue JWTs. |
| W9-c | 2026-07-18 | Flip DNS: `bb.sidcorp.co` → v3 web. v2 stays at `bb-legacy.sidcorp.co` (read-only). |
| W9-d | 2026-07-19 | Tag `Bumblebee-cli` repo as `v2-final`. Lock v2 DB write access. |
| W10+ | 2026-07-20+ | v2 archive period (90 days read-only) → final delete 2026-10-18. |

## Users migration

### Script: `scripts/migrate-users.sql`

```sql
-- Run against v3 Postgres (bumblebee_v3) with v2 DB attached via dblink or pg_dump pipe.
-- Source: v2 `users` table (UUID id, email, password_hash, created_at, ...).
-- Target: v3 `users` (same shape, status enum simplified).

INSERT INTO bumblebee_v3.users (id, email, password_hash, created_at, updated_at)
SELECT id, email, password_hash, created_at, NOW()
FROM bumblebee_v2.users
WHERE deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;
```

### Execution

```bash
# 1. Dump v2 users only
pg_dump -h db.sidcorp.co -p 15434 -U postgres \
  --table=users --data-only --column-inserts \
  bumblebee > /tmp/v2-users.sql

# 2. Apply to v3 (rename target table or strip schema prefix as needed)
psql -h db.sidcorp.co -p 15434 -U postgres -d bumblebee_v3 -f /tmp/v2-users.sql

# 3. Validate counts match
psql -h db.sidcorp.co -p 15434 -d bumblebee_v3 -c "SELECT COUNT(*) FROM users;"
```

### JWT re-issuance
- v2 JWTs use different signing key than v3. Active sessions invalidated on cutover.
- Users prompted to re-login on first v3 visit (acceptable: <20 active users).
- Optional: short bridge endpoint `/api/v3/auth/migrate` accepts v2 JWT, re-signs as v3 (only available during W9-c, 48h window).

## Data NOT migrated

| v2 entity | Decision | Reason |
|---|---|---|
| `work_items` | Not migrated | Status drift (14 → 8 statuses), schema mismatch. v2 stays read-only for audit. |
| `comments` | Not migrated | Tied to work_items. |
| `agent_sessions` | Not migrated | v3 uses different runner model. |
| `sprints`, `custom_fields` | Not migrated | YAGNI in v3 MVP. |
| `queue`, `devices` | Not migrated | Different architecture (single binary, no daemon). |
| `events` | Not migrated | v3 starts fresh audit trail. |
| Worktrees on disk | Not migrated | Cleaned post-cutover (`rm -rf ~/.bumblebee/worktrees`). |

## v2 archive

```bash
# In Bumblebee-cli repo (run W9-d)
cd D:/Source/Bumblebee-cli
git checkout master
git tag -a v2-final -m "Final v2 release before v3 cutover (2026-07-19)"
git push origin v2-final
gh repo edit --description "ARCHIVED. See bumblebee for v3."
gh repo archive  # makes repo read-only on GitHub
```

v2 Coolify resources renamed: `bumblebee-api` → `bumblebee-api-legacy` (kept running 90 days for read access).

## Portfolio rollback

If v3 fails post-cutover (W9-c+), flip DNS back:

1. DNS: `bb.sidcorp.co` → v2 web Coolify resource (revert CNAME).
2. v2 DB write access re-enabled (`GRANT INSERT, UPDATE ON ALL TABLES ...`).
3. Users re-login with v2 JWTs (still valid if rollback within 7 days).
4. Document incident, decide whether to retry cutover or extend dual-run.

**Max rollback window:** 7 days post-cutover. After that, v2 DB drift makes rollback impractical (v3 has new users/data).

## Success metrics (cutover)

- [ ] 100% of active v2 users (last-30d) successfully re-authenticated on v3 within 7 days
- [ ] Zero data loss for `users` (count matches v2 source)
- [ ] v3 prod uptime ≥99% during W9 soak
- [ ] No P0/P1 incidents in W9
- [ ] DNS flip completed in <30 min downtime

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Users can't login post-cutover | M | H | Bridge endpoint W9-c; runbook + on-call during flip |
| v2 archive prematurely deleted | L | H | 90-day read-only period; explicit delete ticket required |
| DNS propagation slow | M | M | TTL lowered to 60s 24h before flip |
| v3 hidden bug surfaces post-cutover | M | H | Rollback DNS in <10 min; 7-day rollback window |
| Worktree disk cleanup deletes active work | L | M | Backup `~/.bumblebee/` to tarball before cleanup |

## Open questions
- Who owns the cutover ops window? (solo dev → schedule low-traffic weekend)
- Is there a v2 user audit log we need to export before archive?
- Decide: keep v2 read-only on bb-legacy.sidcorp.co indefinitely, or 90 days then delete?
