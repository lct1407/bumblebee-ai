# Phase 0 — Greenfield Scaffold + pypi Package Layout

## Context Links

- Master plan: [`plan.md`](./plan.md) v1.1.1 §8 Phase 0
- Architecture: [`../reports/architecture-260518-agent-orchestrator-framework.md`](../reports/architecture-260518-agent-orchestrator-framework.md)
- Extensibility brainstorm: [`../reports/brainstormer-260518-1725-bb-v3-extensible-framework.md`](../reports/brainstormer-260518-1725-bb-v3-extensible-framework.md)
- Existing scaffold: `D:\Source\bumblebee-v3\` (77 files, 51 tests passing — baseline)

---

## Overview

| Field | Value |
|---|---|
| Priority | 🔴 Critical (blocks all later phases) |
| Status | 🚧 Partial (~70% done in `bumblebee-v3/`); restructure pending |
| Duration | 1.5 weeks |
| Acceptance | `pip install -e .` works; `bumblebee --help` shows console commands; DB migrations run; 51 tests still pass after restructure |

**Brief:** Restructure existing greenfield scaffold to **top-level Python package `bumblebee/`** (vs current `api/src/`) for pypi distribution. Add `pyproject.toml` console_scripts (`bumblebee` CLI). Reserve pypi name `bumblebee-ai` + npm scope `@bumblebee`. Submit PEP 541 takeover for `pypi/bumblebee`.

---

## Key Insights

- Existing scaffold at `D:\Source\bumblebee-v3\` has 14 SQLAlchemy models, 6 routers, services across 7 planes, 51 passing tests, Alembic migration, Docker Compose PG.
- **NOT a rewrite** — restructure only. `bumblebee-v3/api/src/` → `bumblebee-v3/bumblebee/`. Imports change from `from src.x` → `from bumblebee.x`.
- pypi name `bumblebee` is taken by abandoned 2011 lib; locked **`bumblebee-ai`** for v3.0. PEP 541 takeover submitted in parallel.
- npm `@bumblebee` scope confirmed available (HTTP 404 on registry endpoint).
- Console_scripts entry: `[project.scripts] bumblebee = "bumblebee.cli:main"` → user gets `bumblebee` command after `pip install bumblebee-ai`.

---

## Requirements

### Functional
- F1. Top-level `bumblebee/` Python package (not nested under `api/src/`)
- F2. `pyproject.toml` with `[project.scripts] bumblebee = "bumblebee.cli:main"`
- F3. `bumblebee` CLI subcommands: `init`, `db migrate`, `db seed`, `server`, `daemon`, `version`
- F4. CI workflow (GitHub Actions): build wheel, install in clean venv, run tests, smoke `bumblebee --help`
- F5. pypi name `bumblebee-ai` reserved (create empty placeholder release if needed to lock)
- F6. npm scope `@bumblebee` registered as org
- F7. PEP 541 takeover request submitted (parallel, async, non-blocking)

### Non-functional
- N1. Package size <5MB (initial wheel)
- N2. Install time <60s on clean venv (cached pypi)
- N3. Works on Linux + macOS + Windows (matrix CI from Phase 0)
- N4. Python 3.12 + 3.13 supported

---

## Architecture

### Package Layout (Target)

```
bumblebee-v3/                      # repo root (renamed → bumblebee/ at Phase 8)
├── pyproject.toml                 # top-level Python package config + console_scripts
├── README.md
├── .env.example
├── docker-compose.yml
├── alembic.ini                    # moved up from api/
├── alembic/                       # migrations (was api/alembic/)
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
├── bumblebee/                     # ⭐ NEW: top-level package (was api/src/)
│   ├── __init__.py                # version exported
│   ├── cli.py                     # ⭐ NEW: bumblebee CLI entry — typer
│   ├── config.py
│   ├── database.py
│   ├── main.py                    # FastAPI app
│   ├── models/                    # 14 entities
│   ├── schemas/
│   ├── routers/
│   ├── services/                  # 7 planes
│   ├── seeds/
│   ├── workflows/                 # YAML workflow defs (moved from workflows/)
│   └── plugins/                   # ⭐ stub for Phase 3 PluginLoader
├── tests/                         # 51 tests (was api/tests/)
├── docs/                          # plan, architecture, getting-started
├── web/                           # Next.js — Phase 4
└── .github/workflows/
    ├── ci.yml                     # lint + test matrix
    └── release.yml                # build wheel → TestPyPI on tag (Phase 7)
```

### Console_scripts CLI Subcommands

| Cmd | Function | Phase available |
|---|---|---|
| `bumblebee version` | print package version | 0 |
| `bumblebee init` | create `~/.bumblebee/`, copy `.env` template | 0 |
| `bumblebee db migrate` | wrap `alembic upgrade head` | 0 |
| `bumblebee db seed` | run `bumblebee.seeds.seed_default` | 0 |
| `bumblebee server` | start uvicorn FastAPI | 0 |
| `bumblebee daemon` | start worker daemon | 1 (stubbed in 0) |
| `bumblebee issue create/list/show` | CRUD shortcuts | 0 (stub → call TS CLI?) or 7 |
| `bumblebee plugins list/reload` | plugin management | 3 |

**Decision:** Phase 0 implements `version`, `init`, `db migrate`, `db seed`, `server`. Others stubbed (`not yet implemented` message).

---

## Related Code Files

### Modify
| File | Change |
|---|---|
| `bumblebee-v3/api/pyproject.toml` | Move to root `bumblebee-v3/pyproject.toml`; add `[project.scripts]`; rename pkg to `bumblebee-ai` |
| `bumblebee-v3/api/alembic.ini` | Move to root; update `sqlalchemy.url` reference |
| `bumblebee-v3/api/src/**` | Move to `bumblebee-v3/bumblebee/**` |
| All `from src.x` imports | Change to `from bumblebee.x` |
| `bumblebee-v3/api/tests/**` | Move to `bumblebee-v3/tests/**`; update conftest imports |
| `bumblebee-v3/api/alembic/env.py` | Update `from src.models` → `from bumblebee.models` |
| `bumblebee-v3/.env.example` | Match new paths |
| `bumblebee-v3/docker-compose.yml` | No change |

### Create
| File | Purpose |
|---|---|
| `bumblebee-v3/bumblebee/cli.py` | Typer CLI entry: `main()` function dispatches subcommands |
| `bumblebee-v3/bumblebee/plugins/__init__.py` | Stub module for Phase 3 PluginLoader |
| `bumblebee-v3/.github/workflows/ci.yml` | GH Actions: lint + test matrix Linux/macOS/Windows |
| `bumblebee-v3/CONTRIBUTING.md` | Dev setup + commit conventions |
| `bumblebee-v3/CHANGELOG.md` | Track releases |

### Delete (post-restructure)
- `bumblebee-v3/api/` directory (after content moved up)

---

## Implementation Steps

### Day 1 — Verify scaffold + plan move

1. Snapshot current state: `cd D:/Source/bumblebee-v3 && git status` — should be clean post-Phase 0 scaffold commit
2. Run baseline: `pytest tests/` — confirm 51/51 pass before any restructure
3. Decision: restructure in-place OR new branch? → **in-place on `master`** since this is greenfield repo

### Day 2-3 — Restructure

4. Move directories:
   ```
   git mv api/src bumblebee/
   git mv api/alembic ./alembic
   git mv api/alembic.ini ./alembic.ini
   git mv api/tests ./tests
   git mv api/pyproject.toml ./pyproject.toml
   ```
5. Update imports across all .py files: `from src.` → `from bumblebee.`
   - Use sed/Edit tool, batch replace
   - Verify with grep that no `from src.` remains
6. Update `alembic/env.py`: `from src.models import Base` → `from bumblebee.models import Base`
7. Update `tests/conftest.py`: imports
8. Update `pyproject.toml`:
   ```toml
   [project]
   name = "bumblebee-ai"  # ⭐ new name
   version = "0.3.0"
   ...
   [project.scripts]
   bumblebee = "bumblebee.cli:main"
   bumblebee-server = "bumblebee.main:main"
   ```
9. Update `pyproject.toml` setuptools config:
   ```toml
   [tool.setuptools.packages.find]
   where = ["."]
   include = ["bumblebee*"]
   ```
10. Run `pytest tests/` — must show 51/51 pass

### Day 4 — CLI entry

11. Create `bumblebee/cli.py` using Typer:
    ```python
    import typer
    app = typer.Typer()
    db_app = typer.Typer()
    app.add_typer(db_app, name="db")
    
    @app.command()
    def version(): ...
    @app.command()
    def init(): ...
    @db_app.command("migrate")
    def db_migrate(): ...
    @db_app.command("seed")
    def db_seed(): ...
    @app.command()
    def server(host: str = "0.0.0.0", port: int = 8000): ...
    @app.command()
    def daemon(): ...  # stub for Phase 0
    
    def main(): app()
    ```
12. Add Typer to deps in pyproject if not present
13. Test: `pip install -e . && bumblebee --help`

### Day 5 — CI workflow

14. Create `.github/workflows/ci.yml`:
    - Matrix: Python 3.12 + 3.13 × Linux/macOS/Windows
    - Steps: checkout → setup-python → pip install -e ".[dev]" → ruff check → pytest
    - Cache pip + PG via docker-compose-action
15. Push branch, verify CI green
16. Run `pip install -e . && bumblebee version` locally — verify console_script wiring

### Day 6 — pypi/npm reservation

17. Visit https://pypi.org/account/register/ — create account if needed
18. Submit PEP 541 takeover at https://github.com/pypi/support/issues/new?template=pep541.yml — quote 2011 abandoned + plan use
19. Build placeholder wheel: `pip install build && python -m build`
20. Upload empty placeholder to TestPyPI under `bumblebee-ai` (block name)
21. Register npm org `bumblebee` at https://www.npmjs.com/org/create
22. Document credentials + ownership in private team doc (NOT commit)

### Day 7 — Validation

23. Clean venv test:
    ```bash
    python -m venv /tmp/cleantest
    source /tmp/cleantest/bin/activate
    pip install -e /path/to/bumblebee-v3
    bumblebee --help        # should show command tree
    bumblebee version       # should print 0.3.0
    bumblebee db migrate    # should succeed against running PG
    bumblebee db seed       # should populate baseline
    bumblebee server &      # backgroud
    curl localhost:8000/health  # 200 ok
    ```
24. Document any issues in `docs/getting-started.md`
25. Commit + push: `chore(phase-0): restructure to top-level bumblebee package + console_scripts`

---

## Todo List

- [ ] Baseline test pass (51/51) before any restructure
- [ ] Move `api/src/` → `bumblebee/`
- [ ] Move `api/alembic/` → `alembic/`
- [ ] Move `api/tests/` → `tests/`
- [ ] Update all `from src.` → `from bumblebee.` imports
- [ ] Update `alembic/env.py` model imports
- [ ] Update `pyproject.toml`: name=`bumblebee-ai`, add `[project.scripts]`
- [ ] Re-run tests post-restructure (51/51)
- [ ] Create `bumblebee/cli.py` with Typer entry
- [ ] Wire CLI subcommands: version, init, db migrate, db seed, server
- [ ] Stub: daemon, plugins (Phase 1/3)
- [ ] Create `.github/workflows/ci.yml` (3-OS × 2-Python matrix)
- [ ] Push, verify CI green
- [ ] Register pypi placeholder for `bumblebee-ai`
- [ ] Submit PEP 541 takeover request for `pypi/bumblebee`
- [ ] Register npm org `@bumblebee`
- [ ] Clean-venv install smoke test
- [ ] Commit phase 0 complete

---

## Success Criteria

| Criterion | Verification |
|---|---|
| 51/51 tests pass after restructure | `pytest tests/` |
| `pip install -e .` succeeds in clean venv | Smoke test step 23 |
| `bumblebee --help` lists subcommands | step 23 |
| `bumblebee db migrate && db seed && server` brings up working API | step 23 |
| CI green on Linux/macOS/Windows × Py 3.12/3.13 | GitHub Actions matrix |
| pypi `bumblebee-ai` reserved | TestPyPI listing |
| npm `@bumblebee` org registered | npmjs.com org page |
| PEP 541 request submitted | GitHub issue link |

---

## Risk Assessment

| Risk | P | I | Mitigation |
|---|---|---|---|
| Tests break after import rename | H | M | Batch sed in single commit; immediately run pytest; revert if fail |
| asyncpg wheel fails on Windows clean install | M | H | CI matrix from day 1; fallback to psycopg if blocked |
| pypi `bumblebee-ai` taken by someone in interim | L | M | Submit immediately (today) |
| PEP 541 rejected | L | L | Doesn't block — `bumblebee-ai` is our name regardless |
| CI matrix flake on Windows | M | M | Mark Windows allow-failures initially; fix-forward |
| Console_scripts cache issue (`bumblebee` not found after pip install) | M | M | `pip install -e . --force-reinstall`; document in getting-started |

---

## Security Considerations

- No new attack surface in restructure
- pypi placeholder upload: use API token (not password); store in private vault
- npm org: 2FA required for publishing
- PEP 541 request: public on GitHub; don't include credentials or private contacts

---

## Next Steps

**Unblocks:**
- Phase 1 (Single-agent E2E) — needs top-level `bumblebee/` package
- Phase 3 (PluginLoader) — needs `bumblebee/plugins/` module
- Phase 7 (pypi publishing) — needs name + CI in place

**Depends on:**
- Existing `bumblebee-v3/` scaffold (✅ done, 51 tests passing)

---

## Unresolved Questions

1. **CLI library**: Typer (Python 3.12 native, FastAPI-style decorators) vs Click (mature). Recommend Typer for ergonomic match with FastAPI stack.
2. **PEP 541 timing**: submit Phase 0 day 6, or later when product is more visible? Earlier = faster review, recommend day 6.
3. **Wheel optional extras**: `pip install bumblebee-ai[server]` vs `[daemon]` vs `[cli]`? Defer to Phase 7; for now single all-in-one wheel.
4. **Console_script `bumblebee-server` redundant with `bumblebee server`?** Yes — pick `bumblebee server` only.
5. **Windows pty/console**: Typer + Rich rendering on Windows cmd vs PowerShell — test in Phase 0 day 7 smoke test.
