# Phase E — Audit + changelog + WS auth + DR + SOC2-prep

## Context

- Plan: [plan.md](plan.md)
- Depends on: Phase A (audit UI needs workspace scope)

## Overview

| | |
|---|---|
| Priority | 🟡 High — compliance + change tracking |
| Status | pending |
| Weeks | 10-11 |
| Brief | Surface the audit trail in UI, formalize release process, close the WS auth gap, document DR + security policy. Brings the SaaS to "audit-ready / SOC2-prep complete" state. |

## Key Insights

- Event log already captures most actions. UI surface + filter + CSV export is missing.
- Field-level events on PATCH `/issues` is silent — emit on every field change so Activity tab shows diffs.
- Release process is manual today. `scripts/release.py` formalizes: bump version → CHANGELOG stanza from git log → git tag → GitHub release.
- WS `/ws?project=X` accepts unauthenticated clients (known issue from streaming work). MUST close.
- SOC2 prep = policies + runbooks; not a certification, just the artifacts an auditor needs.

## Requirements

### Functional
- **Audit log UI** at `/settings/audit`:
  - Filter by actor (user), action (event type), resource (issue/project/workspace), date range
  - CSV export of filtered results
  - Pagination (50/page, infinite scroll)
- **Field-level events**: every PATCH on `/issues` emits one `field_changed` event per field with `{field, old, new}` payload
- **Release process**:
  - `python scripts/release.py [minor|major|patch]` → bumps version in `pyproject.toml` + `web/package.json`, generates CHANGELOG stanza from `git log` since last tag, opens editor for refinement, creates git tag, pushes, creates GitHub release
- **In-app "What's new"**:
  - On first dashboard visit after deploy, modal shows last release's CHANGELOG stanza
  - Dismissed → flag stored in user prefs
  - Banner persists in header until acknowledged
- **WS auth gate**:
  - `/ws?project=X&token=<JWT>` — token required
  - Validates workspace + role; rejects mismatched
  - CLI daemon connects with `?api_key=<key>` instead
- **DR runbook** `docs/disaster-recovery.md`:
  - Daily PG dump to S3 (or local for self-host)
  - Point-in-time recovery instructions
  - Recovery time objective (RTO): 4h; recovery point objective (RPO): 1h
  - Tested E2E on staging
- **SOC2-prep docs** in `docs/security/`:
  - `security-policy.md` — encryption at rest + transit, access controls, key rotation
  - `incident-response.md` — severities, on-call rotation, public status page workflow
  - `data-processing-addendum.md` (DPA) — template for enterprise customers
  - `data-retention.md` — what we keep, how long, GDPR delete-on-request workflow
  - `sla.md` — 99.5% uptime commitment, refund policy on miss
- **Status page** — simple `/status` page reading recent `health_check` events; future: integrate statuspage.io

### Non-functional
- Audit log query < 500ms p99 for 100k events with filters
- CSV export streams (no full materialization in memory)
- Release script idempotent on dry-run mode

## Architecture

```
PATCH /api/issues/{n} → for each changed field:
  await append_event(type="field_changed",
                     payload={"field":..., "old":..., "new":...},
                     issue_id=..., source="user", actor=current_user)

Audit UI:
  GET /api/workspaces/{ws}/events?actor=X&type=Y&from=DATE&to=DATE&cursor=...
  GET /api/workspaces/{ws}/events.csv?... (streaming)

WS gate:
  /ws?project=X&token=<JWT>
    → decode JWT, check workspace_id matches project's workspace
    → if mismatch → close(4001, "forbidden")
```

## Related Code Files

### Create
- `bumblebee/routers/audit.py` — filtered events endpoint + CSV streamer
- `bumblebee/services/audit/csv_writer.py` — streaming CSV writer
- `bumblebee/services/release/changelog_writer.py` — used by scripts/release.py
- `scripts/release.py`
- `web/src/app/(app)/settings/audit/page.tsx`
- `web/src/components/app/whats-new-modal.tsx`
- `web/src/lib/changelog.ts` — fetch /api/changelog
- `bumblebee/routers/changelog.py` — serves parsed CHANGELOG.md
- `docs/disaster-recovery.md`
- `docs/security/security-policy.md`
- `docs/security/incident-response.md`
- `docs/security/data-processing-addendum.md`
- `docs/security/data-retention.md`
- `docs/security/sla.md`
- `scripts/backup.sh` (PG dump to S3)
- `scripts/restore.sh` (from S3)

### Modify
- `bumblebee/routers/issues.py` — emit `field_changed` events on every changed field in PATCH
- `bumblebee/routers/websocket.py` — require JWT or API key, validate workspace
- `bumblebee/services/websocket/manager.py` — broadcast scoped to workspace (already changed in Phase A)
- `web/src/lib/event-stream.ts` — pass JWT/api_key in WS URL
- `web/src/app/(app)/layout.tsx` — mount `<WhatsNewModal>`

## Implementation Steps

1. **Field-level events** — in `routers/issues.py` PATCH, compute diff between old + new, emit one event per changed field.
2. **Audit endpoint** — `GET /api/workspaces/{ws}/events` with filters: `actor`, `type`, `resource_id`, `resource_type`, `from`, `to`. Cursor-based pagination.
3. **CSV streamer** — generator → StreamingResponse. Headers: `Content-Disposition: attachment`.
4. **Audit UI** — filter chips, date range picker, virtualized table, export button.
5. **`scripts/release.py`** — Typer CLI: `bump`, `notes` (from `git log --oneline` since last tag), `tag`, `push`, `gh release create`.
6. **CHANGELOG endpoint** — `GET /api/changelog` parses `CHANGELOG.md` (markdown) into JSON: `[{version, date, sections: {feat, fix, breaking}}, ...]`.
7. **What's-new modal** — read latest version from API; compare to `user.last_seen_version` cookie; show if different.
8. **WS auth gate** — `routers/websocket.py` extract `token` from query, decode, validate workspace_id matches the project queried. Reject otherwise.
9. **CLI daemon WS client** — update to pass `api_key` in URL.
10. **Backup script** — `pg_dump` + upload to S3 (or `BUMBLEBEE_BACKUP_PATH` for self-host).
11. **Restore script** — verify + `pg_restore`.
12. **DR test** — staging restore from yesterday's backup; verify all data intact + within RPO/RTO.
13. **Security policy docs** — fill the 5 docs from templates (Vanta/Drata samples).
14. **SLA doc** — declare 99.5% uptime, refund policy (10% credit for 99–99.5%, 25% < 99%).
15. **Status page** — simple Next.js page reading recent `health_check` events; future: external statuspage.io.
16. **Tests** — pytest: field-level events emit correctly, audit filter works, CSV stream valid, WS auth gate rejects bad token.

## Todo

- [ ] Field-level event emission on PATCH /issues
- [ ] Audit endpoint with filters + cursor
- [ ] CSV streaming export
- [ ] Audit UI (`/settings/audit`)
- [ ] `scripts/release.py` working end-to-end on dry run
- [ ] `/api/changelog` endpoint
- [ ] What's-new modal
- [ ] WS auth gate closes vulnerability
- [ ] CLI daemon updated to pass api_key
- [ ] Backup + restore scripts
- [ ] DR runbook + E2E test on staging
- [ ] 5 security docs written
- [ ] SLA doc + status page
- [ ] Tests + E2E

## Success Criteria

- ✅ Cross-workspace WS connect rejected (4001)
- ✅ Field change on any issue surfaces in Activity tab + audit log
- ✅ `python scripts/release.py minor` produces clean v0.5.0 release with auto-generated CHANGELOG
- ✅ What's-new modal appears on next deploy, dismissible
- ✅ Audit CSV export of 10k events streams in < 5s
- ✅ Staging DR test: full restore from yesterday's backup completes in < 4h
- ✅ All 5 security docs reviewed + present in repo
- ✅ Status page reachable at `/status`, shows recent uptime

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Field-level events flood event log | Med | Med | Aggregate noisy fields (e.g., "5 changes in 30s by same user" → 1 event); rate-limit per (user, issue, field) |
| Audit CSV memory blowup | Low | Med | Stream, don't materialize; tested with 1M events |
| Release script bugs nuke version | Low | High | Dry-run mode + interactive confirm + git tag rollback path |
| WS auth gate breaks Tauri daemon | High | Med | Daemon uses API key; tested before merge |
| DR test reveals data loss | Med | High | Fix immediately, postpone Phase F until resolved |

## Security Considerations

- WS token validation MUST happen before any event broadcast
- CSV export must filter by workspace (no cross-tenant leak)
- Backups encrypted at rest (S3 KMS or local GPG)
- Security docs reviewed by external counsel before customer-facing use

## Next Steps

- **Depends on**: Phase A
- **Blocks**: nothing — Phase F can start in parallel weeks 11-12
- **Unlocks**: SOC2 readiness audit, enterprise sales conversations, public trust signal
