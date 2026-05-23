# bb v3 — Extensible Framework Addendum

**Date:** 2026-05-18
**Type:** Design addendum to `plans/260518-2010-bb-v3-multi-agent-concurrent/plan.md` v1.0
**Scope:** Plugin discovery + full-stack pypi distribution + TS CLI extensions
**Status:** APPROVED — Approach B + Python core/TS CLI plugins + Full-stack pypi
**Prerequisite:** v3 base plan (locked) + ECC adoption decision pending

---

## 1. Vision

bb v3 = task management platform for users across multiple projects with full traceability (event log, agent sessions, tool calls).

User-side: install via `pip install bumblebee` → run daemon → sync git repos → execute issues via claude-cli.

12 months: extend to dev automation (PR triage, dep updates, migrations) + business process automation (data pipelines, ops workflows).

Distribution: **Python primary** (server, daemon, CLI) + **TypeScript CLI extensions** (npm) for future client-side commands.

Extensibility: **Plugin-ready via entry_points.** New domain = new pypi package, zero core changes.

---

## 2. Decisions Locked

| # | Decision | Choice |
|---|---|---|
| D1 | Architecture | **Approach B** — Plugin-ready via entry_points (vs YAGNI++, vs Framework+App split) |
| D2 | Plugin language | **Python (pypi) primary + TS CLI extensions (npm) secondary** |
| D3 | Distribution surface | **Full-stack pypi** — `pip install bumblebee` gives server + daemon + CLI |
| D4 | Web UI distribution | Out of pypi — npm/Next.js standalone (Phase 4) |

---

## 3. Architecture Additions to v3 Plan

These ADD to existing v3 plan; do NOT replace anything.

### 3.1 Plugin Discovery (`services/plugins/loader.py`)

```python
# Pseudocode — bumblebee/services/plugins/loader.py
from importlib.metadata import entry_points

class PluginLoader:
    """Discover + register external plugins via Python entry_points."""

    def discover(self) -> list[PluginManifest]:
        # Convention: plugins declare under "bumblebee.plugins"
        eps = entry_points(group="bumblebee.plugins")
        return [ep.load() for ep in eps]

    def register(self, plugin: PluginManifest, db: AsyncSession):
        # Each plugin returns: {workflows, agent_defs, skills, tools}
        for wf_yaml in plugin.workflows: ...
        for agent_md in plugin.agent_defs: ...
        for skill_dir in plugin.skills: ...
        for tool_def in plugin.tools: ...
```

Triggered at server startup + `bumblebee plugins reload` CLI command.

### 3.2 Plugin Manifest Spec (`docs/plugin-spec.md`)

A plugin package is a regular pypi package + entry_point:

```toml
# bumblebee-plugin-deploy/pyproject.toml
[project]
name = "bumblebee-plugin-deploy"
dependencies = ["bumblebee>=0.3.0"]

[project.entry-points."bumblebee.plugins"]
deploy = "bumblebee_plugin_deploy:manifest"
```

```python
# bumblebee_plugin_deploy/__init__.py
from pathlib import Path

manifest = {
    "name": "deploy",
    "version": "0.1.0",
    "workflows": list(Path(__file__).parent.glob("workflows/*.yaml")),
    "agent_defs": list(Path(__file__).parent.glob("agent_defs/*.md")),
    "skills": list(Path(__file__).parent.glob("skills/*/SKILL.md")),
    "tools": [],  # optional: list of ToolDef
}
```

Convention enforced by `bumblebee-plugin-template` (cookiecutter) — Phase 6.

### 3.3 Full-Stack pypi Distribution

```
bumblebee (main pypi package)
├── bumblebee.api        — FastAPI server (`bumblebee server`)
├── bumblebee.daemon     — Worker daemon (`bumblebee daemon`)
├── bumblebee.cli        — Python CLI (`bumblebee`)
└── bumblebee.plugins    — Plugin loader (entry_points)
```

Single entry point:
```bash
pip install bumblebee
bumblebee init                  # creates ~/.bumblebee/, default config
bumblebee db migrate            # alembic upgrade head
bumblebee db seed               # default project + agents + workflows
bumblebee server                # start API
bumblebee daemon                # start worker on dev machine
bumblebee issue create "fix X"  # CLI command
bumblebee plugins list          # show installed plugins
bumblebee plugins reload        # reload + re-seed plugins
```

Console scripts registered in pyproject:
```toml
[project.scripts]
bumblebee = "bumblebee.cli:main"
```

### 3.4 TS CLI Extension Layer (deferred to Phase 6+)

Reserve namespace + convention now; build later:

- Python CLI `bumblebee` = primary, full-featured
- npm package `@bumblebee/cli-ext-<name>` = TS extensions for client-side scripting
- TS extensions communicate with server via REST (not direct DB)
- Discovery via filesystem convention (`~/.bumblebee/extensions/`)

Detail spec → Phase 6 work. Decision today: **not blocked** by v3.0 ship.

### 3.5 Module Purity Audit

Add to Phase 0/1 checklist: ensure `services/control/`, `services/dispatch/`, `services/execution/` contain **no hardcoded workflow logic** — all flow drives from workflow YAML + AgentDefinition.

Test: rename `simple-fix-flow` → `default-flow`, no code change required.

---

## 4. Impact on v3 Plan

### 4.1 Phase 0 (Greenfield) — add

- [ ] Restructure `api/src/` → `bumblebee/` package layout (top-level pkg)
- [ ] `pyproject.toml`: top-level package with `[project.scripts] bumblebee = "bumblebee.cli:main"`
- [ ] CI: build wheel + test `pip install dist/*.whl` in clean venv

### 4.2 Phase 1 (Single-agent E2E) — no change

### 4.3 Phase 2 (Safety + Observability) — no change

### 4.4 Phase 3 (Multi-issue ScopeLease) — add

- [ ] **Plugin loader** — `services/plugins/loader.py` (+1d)
- [ ] **Module purity audit** — verify control plane is workflow-driven, no hardcoded role logic (+0.5d)

### 4.5 Phase 4 (Web + Coordinator) — no change

### 4.6 Phase 6 (Knowledge + Skills + AgentDefinition) — add

- [ ] **Reference plugin** — `bumblebee-plugin-example/` (+0.5d)
- [ ] **Plugin spec doc** — `docs/plugin-spec.md` (+0.5d)

### 4.7 Phase 7 (ChatSession + Notifications) — add

- [ ] **`bumblebee` console_scripts** — wire init/db/server/daemon/cli (+1d)
- [ ] **pypi publishing pipeline** — GitHub Actions on tag → upload to TestPyPI then PyPI (+0.5d)

### 4.8 Phase 8 (Cutover) — add

- [ ] **First public release** to TestPyPI; smoke test `pip install bumblebee` in clean env (+0.5d)
- [ ] **Reserve npm namespace** `@bumblebee/cli-ext-*` (no actual TS extension v3.0) (+0d)

**Total addition to v3 timeline: +4.5 days** → ~14 weeks total (vs 13.5 baseline).

---

## 5. Critical Design Constraints

### 5.1 Plugin isolation

- Plugin load failure must **NOT crash server**. Catch ImportError, log, mark plugin disabled, continue.
- Each plugin's workflows/agents/skills tagged with `source_plugin` in DB. Listed in `bumblebee plugins list`.
- Plugin metadata table: `plugin_registrations` (name, version, loaded_at, status, error_message).

### 5.2 Plugin version policy

- Plugin declares `bumblebee>=X.Y` in pyproject.
- Plugin loader checks version compat at register time. Refuse loading if mismatch.
- bb v3.0 reserves the right to evolve plugin manifest format — semver MAJOR bump = plugin manifest schema change allowed.

### 5.3 Naming convention

- Pypi packages: `bumblebee-plugin-<name>` (e.g., `bumblebee-plugin-deploy`, `bumblebee-plugin-payment`).
- Internal Python module: `bumblebee_plugin_<name>` (snake_case).
- Entry point group: `bumblebee.plugins` (singular `bumblebee` to match package name).

### 5.4 Plugin doesn't subvert safety

- Plugin CANNOT bypass BudgetEnforcer, LoopDetector, or KillSwitch.
- Plugin tools must register via ToolRegistry (subject to per-role filtering).
- Plugin workflows execute through same LangGraph engine (no bypass).

### 5.5 Plugin lifecycle

- Install: `pip install bumblebee-plugin-deploy` + `bumblebee plugins reload`
- Uninstall: `pip uninstall bumblebee-plugin-deploy` + `bumblebee plugins reload`
- Idempotent: re-register on every restart finds same workflows/agents → upsert by hash.

---

## 6. NOT Building (anti-scope reaffirmed)

| Item | Why skip v3.0 |
|---|---|
| Plugin marketplace (web UI) | YAGNI; pypi search suffices |
| Plugin sandboxing (subprocess isolation) | Trust internal plugins for v3.0; external = future |
| Plugin signing / verification | YAGNI; pypi already TLS+checksums |
| TS CLI extensions (npm packages) actual impl | Reserve convention only; build Phase 6+ |
| Plugin SDK CLI scaffolding tool | YAGNI; manual + docs sufficient |
| Plugin hot-reload (no restart) | YAGNI; reload via CLI command + server restart |
| Multi-language plugins (Go, Rust) | Python only for v3.0 |

---

## 7. Risk Register

| Risk | P | I | Mitigation |
|---|---|---|---|
| Plugin import-time deps break server startup | M | H | Catch ImportError per plugin; isolate failure; log + continue |
| Plugin namespace collisions (2 plugins same workflow name) | M | M | Namespace by plugin: workflow id = `<plugin>:<name>` |
| Plugin author can leak secrets via knowledge_entry | M | M | Plugin-contributed knowledge tagged + reviewable; user can disable |
| pypi name `bumblebee` already taken | H | M | Check pypi NOW. If taken: `bumblebee-platform`. Reserve early. |
| Daemon pypi install Windows breakage (asyncpg native deps) | M | H | Test wheel matrix Linux/macOS/Windows in CI; fall back to psycopg if needed |
| Plugin discovery slow startup (importing N plugins) | L | L | Lazy load: discover at startup but instantiate on-demand |
| Plugin version pin lock-out (langgraph version conflict) | M | M | Document compat matrix in plugin docs; pip resolver handles |
| TS CLI extension namespace squatting (`@bumblebee/`) | M | L | Reserve npm scope NOW even without published packages |

---

## 8. Success Criteria

- [ ] `pip install bumblebee` works on Linux + macOS + Windows in clean venv
- [ ] `bumblebee init && bumblebee db migrate && bumblebee db seed && bumblebee server` brings up working API
- [ ] `bumblebee-plugin-example/` (reference plugin) installs + adds 1 workflow + 1 agent + 1 skill discoverable in `bumblebee plugins list`
- [ ] Plugin load failure isolated: bad plugin doesn't crash server
- [ ] Plugin workflow runs end-to-end via same execution path as core workflows
- [ ] Module purity: rename a default workflow yaml works without code change

---

## 9. What to Do Now vs Later

### Now (Phase 0 — add immediately to plan)

1. Top-level package rename: `api/src/` → `bumblebee/` (Python package)
2. pyproject.toml top-level with `[project.scripts] bumblebee = "bumblebee.cli:main"`
3. Reserve names: pypi `bumblebee`, npm `@bumblebee`

### Phase 3 (add to existing phase)

4. Plugin loader (`services/plugins/loader.py`)
5. Module purity audit (verify no hardcoded workflow logic)

### Phase 6 (add to existing phase)

6. Reference plugin `bumblebee-plugin-example/`
7. Plugin spec doc

### Phase 7 (add to existing phase)

8. Console_scripts (`bumblebee` CLI entry, init/db/server/daemon)
9. pypi publishing pipeline (GitHub Actions)

### Phase 8 (add to existing phase)

10. First TestPyPI release smoke test

---

## 10. Open Questions

1. **pypi name availability** — is `bumblebee` available? (CHECK NOW; if taken: `bumblebee-platform` or `bumblebee-ai`)
2. **`pip install bumblebee[server]` vs `[daemon]` vs `[cli]` extras?** — split heavy deps (langgraph, fastapi) from light (daemon)? Yes; reduces user install footprint.
3. **Plugin can register database schema migrations?** — V3.0: NO (plugins don't run alembic). Future: optional alembic discovery via entry_points. Defer.
4. **Plugin signing for trust** — YAGNI for v3.0. Phase 9+ if marketplace ever happens.
5. **TS CLI extensions discovery mechanism** — filesystem (~/.bumblebee/extensions/), npm global pkgs, or both? Defer to Phase 6.

---

## 11. Decision Summary

| Decision | Choice |
|---|---|
| Approach | **B — Plugin-ready** (entry_points discovery + manifest spec) |
| Plugin language | **Python primary (pypi)** + TS CLI extensions deferred |
| Distribution | **Full-stack pypi** (`pip install bumblebee` = server + daemon + CLI) |
| Web UI | npm/Next.js separate, NOT in pypi |
| Effort delta on v3 plan | **+4.5 days** spread across Phase 0/3/6/7/8 |
| New v3.0 total timeline | **~14 weeks** (vs 13.5 baseline) |

---

## 12. Next Steps

1. **CHECK pypi name `bumblebee` availability** — single command, blocks Phase 0 if taken
2. **CHECK npm scope `@bumblebee` availability** — reserve early
3. **Update `plans/260518-2010-bb-v3-multi-agent-concurrent/plan.md`** to reflect:
   - §2 Core Abstractions: add PluginManifest (light entity, just registration tracking)
   - §3 Plane 1 Control: mention PluginLoader subsystem
   - §8 Cutover: add Phase 0/3/6/7/8 plugin tasks
   - §9 NOT building: add plugin marketplace/sandboxing/signing
   - §11 Decisions Locked: add D1-D4 from above
4. **Then proceed with `/ck:plan` for Phase 0 implementation** OR continue current Phase 0 execution + integrate plugin items.

---

**Status:** APPROVED — design locked
**Summary:** Approach B (plugin-ready via entry_points) + Python core/TS CLI plugins + full-stack pypi distribution. Adds +4.5d to v3 timeline. No fundamental architecture change required — workflow-as-data + AgentDefinition + Skill entities already support plugin loading.
