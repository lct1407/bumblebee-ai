# Phase 8 — Cutover + TestPyPI Release

## Context Links

- Master plan: [`plan.md`](./plan.md) v1.1.1 §8 Phase 8
- Previous: [`./phase-07-chat-notifications-replay-pypi.md`](./phase-07-chat-notifications-replay-pypi.md)
- v2 audit: [`../reports/brainstormer-260517-2010-bb-v3-architecture.md`](../reports/brainstormer-260517-2010-bb-v3-architecture.md)

---

## Overview

| Field | Value |
|---|---|
| Priority | 🟢 Final — official v3.0 launch |
| Status | ⏳ Not started |
| Duration | 1 week |
| Acceptance | v2 archived; v3 primary; first TestPyPI release smoke-tested on Linux/macOS/Windows; data migration script run successfully |

**Brief:** Migrate selected v2 data (issue metadata only, no event history). Archive `Bumblebee-cli` repo. Promote `bumblebee-v3` → `bumblebee` (or rename per pypi). First TestPyPI release. Reserve npm scope. Documentation finalize.

---

## Key Insights

- v2 had different schema (single-agent, no scope lease, etc.) — full data migration ≠ goal
- Migration scope: extract issue titles + descriptions + comments only; recreate as fresh v3 issues
- No event log migration: v3 events start fresh
- v2 stays runnable as `Bumblebee-cli` (frozen master); v3 is `bumblebee-v3` → `bumblebee` (renamed dir)

---

## Requirements

### Functional
- F1. Data extraction script: read v2 PostgreSQL → export issues + comments as JSON
- F2. Data import script: read JSON → create v3 issues via REST API (idempotency keys)
- F3. v2 service decommissioning checklist
- F4. Domain/DNS cutover (if any production deploy)
- F5. First TestPyPI release tag `v0.3.0-rc1`
- F6. Linux/macOS/Windows clean-venv smoke test of TestPyPI install
- F7. npm scope `@bumblebee` registered (org level)
- F8. CHANGELOG.md updated
- F9. README + docs reflect new install instructions (`pip install bumblebee-ai`)

### Non-functional
- N1. Data migration <30min for 1000 issues
- N2. Zero data loss during migration (verify counts pre/post)
- N3. pypi smoke test <5min per OS

---

## Architecture

### Migration Flow

```
v2 DB (Bumblebee-cli/api PG)
  ↓ extract via psycopg2 + SELECT
issue_export.json (1 file per project)
  ↓ import via bumblebee-ai REST + python script
v3 DB (bumblebee PG) — fresh project rows + issue rows
```

```python
# bumblebee/migrations/v2_import.py
def extract_v2(v2_db_url, project_slug):
    """Pull work_items + comments from v2."""
    # SELECT id, number, title, description, type, status, priority, created_at
    # FROM work_items WHERE project_id = ?

def import_v3(api_url, api_key, payload):
    """Recreate via /api/projects/{slug}/issues."""
    for issue in payload["issues"]:
        resp = requests.post(
            f"{api_url}/api/projects/{payload['slug']}/issues",
            json=issue,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        # Use idempotency_key = f"v2-import-{v2_id}" to dedup
```

### Decommissioning Checklist

- [ ] Stop v2 webhook receivers (Coolify integration disabled)
- [ ] Archive `Bumblebee-cli` repo (GitHub: Settings → Archive)
- [ ] Update README of `Bumblebee-cli`: "Archived. See bumblebee-v3."
- [ ] Drop v2 DB after 30-day retention period

---

## Related Code Files

### Modify

| File | Change |
|---|---|
| `bumblebee/cli.py` | Add `bumblebee migrate-v2` subcommand |
| `README.md` | Update install instructions to `pip install bumblebee-ai` |
| `CHANGELOG.md` | v0.3.0 entry: breaking change from v2 |
| `docs/getting-started.md` | TestPyPI install path |

### Create

| File | Purpose |
|---|---|
| `bumblebee/migrations/__init__.py` | Migration module |
| `bumblebee/migrations/v2_import.py` | Extract + import script |
| `tests/test_v2_import.py` | Migration script test with v2 fixture DB |
| `docs/migration-v2-to-v3.md` | User guide for self-hosted v2 users |
| `MIGRATION.md` | Top-level migration overview |
| `docs/v3-launch-announce.md` | Release announcement copy |

### Delete

- (deferred — Bumblebee-cli stays read-only archive)

---

## Implementation Steps

### Day 1-2 — Migration script

1. **Day 1: Extract**
   - Read v2 schema via direct PG connection
   - Export issues + comments to JSON
   - Validate counts

2. **Day 2: Import**
   - REST-based import via /api/projects/{slug}/issues
   - Idempotency key: `v2-import-{v2_id}` (allows safe re-run)
   - Test with v2 fixture (10 sample issues)

### Day 3 — Cutover prep

3. **Day 3: Decommissioning checklist**
   - Document v2 endpoint sunset (currently `/api/*` and `/api/v2/*` both live)
   - Archive `Bumblebee-cli` repo (GitHub setting)
   - Update v2 README with migration pointer

### Day 4 — Repo rename

4. **Day 4: Rename `bumblebee-v3` → `bumblebee`**
   - GitHub: Settings → Rename
   - Update local clones: `git remote set-url origin <new-url>`
   - Update CI badges + links in docs
   - Optional: keep `bumblebee-v3` as redirect (GitHub auto-handles)

### Day 5 — First TestPyPI release

5. **Day 5: Tag v0.3.0-rc1**
   - Bump version in pyproject.toml
   - Update CHANGELOG.md
   - `git tag v0.3.0-rc1 && git push --tags`
   - CI builds matrix; uploads to TestPyPI

### Day 6 — Smoke test 3 OS

6. **Day 6: Smoke**
   - Linux: clean venv → `pip install -i testpypi bumblebee-ai` → migrate + seed + server + scenario A
   - macOS: same
   - Windows: same (PowerShell + cmd)
   - Document any OS-specific quirks

### Day 7 — Announce + npm scope reserve

7. **Day 7: Finalize**
   - Register npm org `@bumblebee` (no packages yet; just lock name)
   - Publish announcement doc `docs/v3-launch-announce.md`
   - Optionally publish a "Hello World" plugin: `bumblebee-plugin-example` to TestPyPI as separate verification
   - Final commit: `chore(phase-8): v3.0-rc1 cutover + TestPyPI release`

---

## Todo List

- [ ] v2_import.py extract script
- [ ] v2_import.py import script (idempotency keys)
- [ ] tests/test_v2_import
- [ ] Decommissioning checklist documented
- [ ] Archive Bumblebee-cli repo
- [ ] Rename bumblebee-v3 → bumblebee (repo)
- [ ] Update README + docs links
- [ ] Version bump pyproject 0.3.0-rc1
- [ ] Update CHANGELOG.md
- [ ] Tag v0.3.0-rc1; verify CI
- [ ] Linux clean-venv smoke
- [ ] macOS clean-venv smoke
- [ ] Windows clean-venv smoke
- [ ] Register npm @bumblebee org
- [ ] (Optional) Publish bumblebee-plugin-example to TestPyPI
- [ ] v3-launch-announce.md
- [ ] Phase 8 final commit

---

## Success Criteria

| Criterion | Verification |
|---|---|
| v2 data migrated to v3 (idempotent) | Run import twice; same issue counts |
| Bumblebee-cli archived | GitHub Settings shows archived |
| `pip install bumblebee-ai` from TestPyPI works on 3 OS | Smoke test logs |
| `bumblebee version` after install returns 0.3.0-rc1 | Smoke step |
| End-to-end scenario A from fresh install | Smoke test |
| npm @bumblebee org registered | npmjs.com page |
| All Phase 0-7 success criteria still met post-cutover | Re-run integration tests |

---

## Risk Assessment

| Risk | P | I | Mitigation |
|---|---|---|---|
| v2 schema not fully understood; data loss | M | H | Extract is read-only; dry-run; validate counts; backup v2 DB before |
| Repo rename breaks external clones | L | L | GitHub auto-redirects; document |
| TestPyPI upload conflict (name taken) | L | H | Reserved Phase 0; sanity check before release |
| Windows install fails in clean venv | M | H | Phase 0/7 CI matrix should catch; fallback psycopg-binary doc |
| Plugin install fails after pypi rename | M | M | Reference plugin pins `bumblebee-ai>=0.3.0`; test in smoke |
| First user reports bug → no support process | M | M | Issue templates ready; CHANGELOG.md transparent about known limits |

---

## Security Considerations

- **v2 data extraction**: requires read access to v2 PG; use read-only DB user
- **Migration idempotency**: prevents double-creation if script re-runs after partial failure
- **TestPyPI vs PyPI**: rc1 tags → TestPyPI only; stable tags after manual review → PyPI
- **npm scope**: 2FA required for any future publish
- **Release notes**: review for accidental secret disclosure (e.g., dev DB URL in CHANGELOG draft)

---

## Next Steps

**Post v3.0-rc1:**
- Collect feedback from internal users 2-4 weeks
- Iterate to v0.3.0 stable
- Plan v3.1 features (deferred from v3.0):
  - Real-time analytics dashboard
  - Plugin marketplace UX
  - Mobile companion app
  - Voice / TS CLI extensions
  - PEP 541 takeover (if approved) → rename to `bumblebee`
- Begin domain extensions (Approach B in action):
  - `bumblebee-plugin-deploy` (Coolify/Vercel/Fly.io)
  - `bumblebee-plugin-payment` (Stripe/Paddle workflows)
  - `bumblebee-plugin-data-pipeline`

**Depends on:**
- Phase 7 (pypi pipeline) — release infrastructure
- All prior phase acceptance criteria met

---

## Unresolved Questions

1. **v2 sunset date**: 30 days post-v3 release? Or longer overlap (90 days)? Decision: 30 days, with banner in v2 UI warning of imminent shutdown.
2. **Migrate user accounts**: v2 has its own user DB. v3 starts fresh; users re-register. Acceptable for internal team; doc clearly.
3. **PEP 541 status check**: Phase 0 submitted; revisit at Phase 8. If approved before launch, switch pypi name from `bumblebee-ai` → `bumblebee` (publish both as alias period).
4. **First public user external to team**: invite list? Soft launch? Internal-only Phase 8; external Phase 8+1mo if quality good.
5. **Plugin example publish to TestPyPI**: confirms plugin distribution works end-to-end. Yes, Phase 8 day 7 (optional).
