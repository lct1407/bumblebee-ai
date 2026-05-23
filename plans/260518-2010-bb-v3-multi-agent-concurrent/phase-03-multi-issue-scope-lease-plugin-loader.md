# Phase 3 — Multi-Issue ScopeLease + Plugin Loader

## Context Links

- Master plan: [`plan.md`](./plan.md) v1.1.1 §8 Phase 3 + §4.1-4.2 ScopeLease protocol
- Plugin design: [`../reports/brainstormer-260518-1725-bb-v3-extensible-framework.md`](../reports/brainstormer-260518-1725-bb-v3-extensible-framework.md)
- Previous: [`./phase-02-safety-observability.md`](./phase-02-safety-observability.md)

---

## Overview

| Field | Value |
|---|---|
| Priority | 🟡 High — unlocks multi-agent concurrent (Scenarios A+B) |
| Status | 🚧 Partial — ScopeLease entity + LeaseManager scaffolded; glob overlap is heuristic; PluginLoader not yet built |
| Duration | 2 weeks (was 1w; +1w for plugin loader + module purity audit per v1.1) |
| Acceptance | 2 issues run concurrently on disjoint scopes; lease blocks on overlap; dummy plugin loads + registers workflow at startup |

**Brief:** Upgrade ScopeLease glob overlap from prefix heuristic to interval-tree on file sets. Build PluginLoader using Python `entry_points` for extensibility. Audit module purity — ensure no hardcoded workflow logic in control plane.

---

## Key Insights

### Already scaffolded
- `models/scope_lease.py` entity + status enum + heartbeat fields
- `services/dispatch/lease_manager.py` with prefix-overlap heuristic (works for common cases)
- `tests/test_lease_manager.py` covers acquire/conflict/release/heartbeat (4 passing tests)

### Plugin loader requirements
- Discovery via `importlib.metadata.entry_points(group="bumblebee.plugins")`
- Failure-isolated: 1 plugin ImportError → log + mark disabled, don't crash server
- Each plugin manifest returns dict: `{name, version, workflows, agent_defs, skills, tools}`
- Plugin-contributed rows tagged with `source_plugin` for traceability

### Module purity check
- `services/control/` must contain NO hardcoded workflow IDs or role names
- All flow drives from workflow YAML + AgentDefinition rows
- Test: rename `simple-fix-flow` → `default-flow`, no code change needed

---

## Requirements

### Functional
- F1. ScopeLease overlap detection via resolved file-set intersection (not prefix heuristic)
- F2. Conflict queue: blocked acquires can wait + retry when conflicting lease releases
- F3. LeaseManager emits `lease_acquired` / `lease_released` / `lease_revoked` events
- F4. PluginLoader discovers entry_points at server startup
- F5. PluginLoader registers workflows/agents/skills/tools into DB on each startup (upsert by hash)
- F6. `plugin_registrations` table tracks each loaded plugin (name, version, status, error)
- F7. `bumblebee plugins list` CLI shows installed + status
- F8. `bumblebee plugins reload` re-discovers + re-registers
- F9. Plugin failure isolated: ImportError + manifest invalid → server continues
- F10. Module purity: control plane has zero `if workflow.name == "X"` patterns

### Non-functional
- N1. Plugin discovery <2s at startup for ≤10 plugins
- N2. ScopeLease conflict detection <50ms p95 (file count <500)
- N3. Conflict queue wait timeout configurable (default 5min)

---

## Architecture

### ScopeLease v2 — Interval Tree on File Sets

```python
# bumblebee/services/dispatch/lease_manager.py (v2)
import glob, pathlib

def resolve_globs(patterns: list[str], cwd: str) -> set[str]:
    """Pre-resolve glob patterns to actual file set at acquire time."""
    files = set()
    for p in patterns:
        # Use pathlib + glob with **/ support
        for match in pathlib.Path(cwd).glob(p):
            if match.is_file():
                files.add(str(match.relative_to(cwd)))
    return files

def _overlaps(a_files: set[str], b_files: set[str]) -> bool:
    return bool(a_files & b_files)

# On acquire:
async def acquire_lease(session_id, issue_id, patterns, cwd, ttl_seconds):
    new_files = resolve_globs(patterns, cwd)
    active = await get_active_leases()
    for lease in active:
        if _overlaps(new_files, set(lease.resolved_files)):
            return None  # conflict
    # ... grant
```

### Plugin Loader

```python
# bumblebee/services/plugins/loader.py
from importlib.metadata import entry_points
from sqlalchemy.ext.asyncio import AsyncSession

class PluginLoader:
    def __init__(self):
        self._loaded: dict[str, PluginManifest] = {}
    
    async def discover_and_register(self, db: AsyncSession) -> list[PluginResult]:
        results = []
        eps = entry_points(group="bumblebee.plugins")
        for ep in eps:
            try:
                manifest = ep.load()  # might raise ImportError or AttributeError
                await self._register_manifest(db, ep.name, manifest)
                results.append(PluginResult(name=ep.name, status="loaded"))
            except Exception as e:
                results.append(PluginResult(name=ep.name, status="failed", error=str(e)))
                # log + record in plugin_registrations
        return results
    
    async def _register_manifest(self, db, name, manifest):
        # upsert workflows (by graph_hash)
        # upsert agent_defs (by prompt_hash)
        # upsert skills (by name+version)
        # tag source_plugin=name on each
```

### Plugin Manifest Spec

```python
# Plugin author writes:
# bumblebee_plugin_deploy/__init__.py
from pathlib import Path

PLUGIN_ROOT = Path(__file__).parent

manifest = {
    "name": "deploy",
    "version": "0.1.0",
    "workflows": list(PLUGIN_ROOT.glob("workflows/*.yaml")),
    "agent_defs": list(PLUGIN_ROOT.glob("agent_defs/*.md")),
    "skills": list(PLUGIN_ROOT.glob("skills/*/SKILL.md")),
    "tools": [],  # list of ToolDef
}
```

```toml
# pyproject.toml of plugin author
[project.entry-points."bumblebee.plugins"]
deploy = "bumblebee_plugin_deploy:manifest"
```

### Module Purity Audit (no hardcoded workflow logic)

Anti-patterns to grep for + eliminate:
```python
# BAD
if workflow.name == "simple-fix-flow": ...
if role == "implementer": special_logic()
PHASE_TIMEOUTS = {"triage": 600, "implement": 3600}  # hardcoded

# GOOD
if workflow.config.get("special_mode"): ...
agent_def.default_budgets["wall_min"]  # data-driven
```

---

## Related Code Files

### Modify

| File | Change |
|---|---|
| `bumblebee/services/dispatch/lease_manager.py` | Replace prefix heuristic with file-set intersection |
| `bumblebee/models/scope_lease.py` | `resolved_files` already exists; ensure populated on acquire |
| `bumblebee/main.py` | Add PluginLoader.discover_and_register to lifespan startup |
| `bumblebee/cli.py` | Add `plugins list/reload` subcommands |
| `tests/test_lease_manager.py` | Update tests for file-set overlap semantics |

### Create

| File | Purpose |
|---|---|
| `bumblebee/services/plugins/__init__.py` | Module init |
| `bumblebee/services/plugins/loader.py` | PluginLoader class |
| `bumblebee/services/plugins/manifest.py` | PluginManifest spec + validation |
| `bumblebee/models/plugin_registration.py` | DB entity |
| `alembic/versions/20260601_0001_plugin_registrations.py` | New table migration |
| `bumblebee/routers/plugins.py` | `/api/plugins` endpoints |
| `tests/test_plugin_loader.py` | Discovery + isolation + registration tests |
| `tests/test_module_purity.py` | grep-based test that fails if hardcoded workflow names found in control plane |
| `tests/fixtures/dummy_plugin/` | Minimal local plugin for testing |
| `docs/plugin-spec.md` | (Phase 6 expands) initial spec |

### Delete

- (none)

---

## Implementation Steps

### Week 1 — ScopeLease v2

1. **Day 1: file-set overlap**
   - Update `lease_manager.py::acquire_lease`: call `resolve_globs(patterns, cwd)` → store `resolved_files`
   - `_overlaps` uses set intersection
   - Update tests

2. **Day 2: Conflict queue**
   - Add `pending_acquires` in-memory queue (per LeaseManager instance)
   - On release: check queue for waiters whose scope no longer conflicts → grant + notify
   - Timeout: 5min default; configurable

3. **Day 3: Lease event emission**
   - Confirm Event(lease_acquired/released/revoked) emitted on each transition
   - Tests cover event presence

4. **Day 4: Multi-issue concurrent test**
   - `tests/test_multi_issue_scenario_a.py`: 2 issues, different scopes, run in parallel via `asyncio.gather` of workflow triggers
   - Verify both complete; no events cross-pollinate

5. **Day 5: Multi-issue conflict test**
   - `tests/test_multi_issue_scenario_b.py`: 2 issues, overlapping scope
   - Verify second blocks until first releases (with timeout) OR re-queued

### Week 2 — Plugin loader

6. **Day 6: plugin_registrations table**
   - Create Alembic migration
   - Create `models/plugin_registration.py`
   - Tag fields on Workflow/AgentDefinition/Skill: `source_plugin TEXT` (nullable; NULL = core)

7. **Day 7: PluginLoader core**
   - `services/plugins/loader.py`: discover entry_points, load, isolate failures
   - `manifest.py`: Pydantic validate manifest shape

8. **Day 8: Plugin registration upsert**
   - Parse YAML workflows → Workflow rows
   - Parse `.md` agent_defs with frontmatter → AgentDefinition rows
   - Parse `SKILL.md` skills → Skill rows
   - Upsert by hash (graph_hash, prompt_hash, skill name+version)
   - Tag `source_plugin`

9. **Day 9: CLI + endpoints**
   - `bumblebee plugins list` → query plugin_registrations
   - `bumblebee plugins reload` → call PluginLoader.discover_and_register
   - `GET /api/plugins` + `POST /api/plugins/reload` endpoints

10. **Day 10: Dummy plugin fixture**
    - `tests/fixtures/dummy_plugin/` with pyproject + manifest + 1 workflow + 1 agent + 1 skill
    - In test: install via `pip install -e tests/fixtures/dummy_plugin/`
    - Verify discovery + DB rows tagged

11. **Day 11: Plugin failure isolation tests**
    - Plugin raises ImportError → loader marks disabled, server continues, other plugins still load
    - Plugin missing required manifest fields → validation error, marked disabled

12. **Day 12: Module purity audit**
    - `tests/test_module_purity.py`: grep `services/control/` for hardcoded workflow/role names
    - Fail test if anti-patterns found
    - Refactor any violations

13. **Day 13: Plugin docs + acceptance**
    - `docs/plugin-spec.md` initial spec
    - Run all tests; verify Scenarios A+B + plugin load all work
    - Commit: `feat(phase-3): scope-lease v2 + plugin-loader + module purity`

14. **Day 14: Buffer**

---

## Todo List

- [ ] ScopeLease file-set overlap (replace heuristic)
- [ ] Conflict queue for blocked acquires
- [ ] Lease event emission verified
- [ ] tests/test_multi_issue_scenario_a (disjoint)
- [ ] tests/test_multi_issue_scenario_b (overlap)
- [ ] plugin_registrations table + migration
- [ ] models/plugin_registration.py
- [ ] source_plugin column on workflows/agent_defs/skills
- [ ] PluginLoader core (discover + isolate)
- [ ] Manifest validation
- [ ] Plugin upsert logic
- [ ] `bumblebee plugins list/reload` CLI
- [ ] `/api/plugins` endpoints
- [ ] Dummy plugin fixture
- [ ] Plugin failure isolation tests
- [ ] Module purity audit + test
- [ ] docs/plugin-spec.md initial
- [ ] Acceptance + commit

---

## Success Criteria

| Criterion | Verification |
|---|---|
| 2 issues run concurrently, disjoint scope | tests/test_multi_issue_scenario_a |
| 2 issues, overlap scope: second blocks | tests/test_multi_issue_scenario_b |
| File-set overlap accurate vs prefix heuristic | tests with `src/a.py` vs `src/a*.py` corner case |
| Plugin load failure doesn't crash | tests/test_plugin_loader::test_failure_isolated |
| Dummy plugin workflow/agent/skill in DB | tests/test_plugin_loader::test_dummy_full |
| `bumblebee plugins list` shows status | CLI smoke test |
| `services/control/` has no hardcoded workflow names | tests/test_module_purity passes |
| Rename `simple-fix-flow` → `default-flow` works | manual: edit YAML, restart, run — no code change |

---

## Risk Assessment

| Risk | P | I | Mitigation |
|---|---|---|---|
| File-set resolve slow on large repos | M | M | Cache resolved_files per session; skip if cwd unchanged |
| Conflict queue starvation (low-priority always blocked) | M | M | Queue priority = (priority, age); old waiters bumped |
| Plugin ImportError crashes whole startup | M | H | catch at PluginLoader level; pytest covers this case |
| Plugin namespace collision (2 plugins same workflow name) | M | M | Workflow id internally = `{plugin}:{name}`; display as `name` |
| Module purity test too strict (false positive) | M | L | Allowlist file paths; refine grep pattern |
| Plugin doesn't declare bumblebee>=X.Y dep | M | M | Loader checks at register time; refuse if mismatch |

---

## Security Considerations

- **Plugin trust**: Phase 3 trusts installed pypi packages (user controls pip install); marketplace/sandboxing deferred per anti-scope
- **Plugin file globs**: plugin-contributed workflows can claim file scopes; ensure plugin can't grant itself access outside intended dirs
- **Plugin SQL**: plugins ONLY return data (manifest dict); cannot execute SQL directly
- **Plugin imports at startup**: 1 minute exec of `manifest = entry_point.load()` — short, isolated; consider subprocess isolation in future
- **Source attribution**: every plugin-contributed row tagged `source_plugin`; user can audit

---

## Next Steps

**Unblocks:**
- Phase 4 (Coordinator) — needs reliable ScopeLease for multi-specialist
- Phase 6 (Reference plugin) — needs PluginLoader working
- Any future domain extension (deploy, payment, etc.)

**Depends on:**
- Phase 0 (top-level package) — plugins import `bumblebee.*`
- Phase 1 (full workflow traversal) — plugin workflows run via same engine

---

## Unresolved Questions

1. **Resolve globs on which working tree?** — Per-issue worktree (specific to session) or project base branch? Phase 3 day 1 decision: project base for lease acquire-time check; harness uses its own worktree once granted.
2. **Plugin version pin compat**: pip resolver handles, but should bb v3 enforce min plugin version too? Defer.
3. **PluginLoader on every server restart re-registers** — fine for now; later add hash-based skip-if-unchanged.
4. **Conflict queue persistence**: in-memory loses on restart; OK for Phase 3 since active workflows reload from PostgresSaver. Document.
5. **Module purity test brittleness**: should we use AST visit instead of grep? Phase 3 day 12: grep is enough for first pass.
