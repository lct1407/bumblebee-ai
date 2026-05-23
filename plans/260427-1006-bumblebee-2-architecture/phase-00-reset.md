# Phase 0 — Reset

**Track:** Foundation (blocking) | **Effort:** 3 days | **Status:** pending

## Context

Wipe slate clean before redesign. No production users yet — acceptable to drop dev data after JSON archive.

## Requirements

- Export current DB to JSON archive (rollback safety)
- Drop `cli/` Python entirely
- Drop Python CLI daemon code
- Reset Alembic migrations (single new init)
- Remove status alias map + `pipeline_config` references in code

## File Ownership

- `api/alembic/` — reset migrations
- `api/scripts/export-legacy.py` (new) — JSON archive
- `cli/` — DELETE entire directory
- `api/src/services/pipeline_orchestrator.py` — DELETE
- Documentation cleanup (CLAUDE.md, docs/)

## Implementation Steps

1. **Backup branch** — `git checkout -b legacy/v0.13-archive`, push to origin
2. **Write export script** `api/scripts/export-legacy.py`:
   - Dumps `projects, work_items, comments, work_item_events, agent_runs, agent_sessions` → `archive/legacy-{date}.json`
   - Includes schema version, table counts, row counts for verify
3. **Run export** locally + commit archive output to `archive/` (gitignored except sample)
4. **Drop Python CLI**:
   - `git rm -r cli/`
   - Update root `CLAUDE.md` removing Python CLI references
   - Update `pyproject.toml` if needed
5. **Drop Python daemon code**:
   - `cli-ts/` keeps `bb daemon` placeholder for P5
   - Remove `cli/bumblebee/agent/daemon.py` references
6. **Reset Alembic**:
   - `cd api && rm alembic/versions/*.py`
   - Drop dev DB: `psql -c "DROP DATABASE bumblebee_dev; CREATE DATABASE bumblebee_dev;"`
   - Empty placeholder `0001_init.py` (will be filled in P1)
7. **Remove orchestrator**:
   - `git rm api/src/services/pipeline_orchestrator.py`
   - Strip `on_status_change` calls from `api/src/api/work_items.py`
   - Strip status alias dict
8. **Update CLAUDE.md** — remove pipeline orchestrator section, status alias section, mark "v2.0 redesign in progress"
9. **Commit + tag** — `chore(p0): wipe legacy schema for v2.0 redesign` + tag `v2.0-reset`

## Todo

- [ ] Create `legacy/v0.13-archive` branch + push
- [ ] Write `api/scripts/export-legacy.py`
- [ ] Run export, verify JSON archive integrity
- [ ] Delete `cli/` directory
- [ ] Delete Python daemon code
- [ ] Reset Alembic migrations folder
- [ ] Drop + recreate dev DB
- [ ] Delete `pipeline_orchestrator.py`
- [ ] Strip orchestrator calls from `work_items.py`
- [ ] Update root CLAUDE.md
- [ ] Commit + tag `v2.0-reset`

## Success Criteria

- [ ] `archive/legacy-{date}.json` exists, validates against schema
- [ ] `cli/` directory không còn trong repo
- [ ] `alembic/versions/` chỉ có 1 placeholder file
- [ ] Dev DB empty (no tables)
- [ ] `grep -r "pipeline_orchestrator\|status_alias" api/` returns 0 results
- [ ] `git log --oneline -1` = "chore(p0): wipe legacy schema for v2.0 redesign"
- [ ] Tag `v2.0-reset` pushed

## Risks

- Forgot to backup: mitigated by `legacy/v0.13-archive` branch
- Drop production DB by accident: only run on `bumblebee_dev`, never `bumblebee_prod`
