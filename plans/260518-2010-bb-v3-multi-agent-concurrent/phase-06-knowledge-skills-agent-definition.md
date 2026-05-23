# Phase 6 — Knowledge Memory + Skills + AgentDefinition + Reference Plugin

## Context Links

- Master plan: [`plan.md`](./plan.md) v1.1.1 §8 Phase 6 + §2.6-2.11 entities
- Knowledge research: [`../reports/researcher-260518-0112-knowledge-systems-for-agents.md`](../reports/researcher-260518-0112-knowledge-systems-for-agents.md)
- ECC adoption: [`../reports/evaluation-260518-1725-everything-claude-code-applicability.md`](../reports/evaluation-260518-1725-everything-claude-code-applicability.md)
- Plugin design: [`../reports/brainstormer-260518-1725-bb-v3-extensible-framework.md`](../reports/brainstormer-260518-1725-bb-v3-extensible-framework.md)
- Previous: [`./phase-05-failure-taxonomy.md`](./phase-05-failure-taxonomy.md)

---

## Overview

| Field | Value |
|---|---|
| Priority | 🟡 High — substantive intelligence layer; foundation for organic learning |
| Status | 🚧 Partial (~75%) — entities scaffolded; Context Assembler integration + reference plugin pending |
| Duration | 2 weeks (was 1.5w; +0.5w for plugin spec + reference plugin per v1.1) |
| Acceptance | Context Assembler pulls relevant Knowledge for each session; decay reaper archives unused; reference plugin installs + adds workflow/agent/skill |

**Brief:** Wire **ProjectKnowledge** (categorized Knowledge entries with useCount/lastUsedAt decay) into harness Context Assembler. Complete **Skill** + **AgentDefinition** integration (load prompt + tools + budgets from DB into harness). Ship **reference plugin** `bumblebee-plugin-example/` proving extensibility. Borrow 10 ECC agent prompts + 15 skills via vendoring.

---

## Key Insights

### Already scaffolded
- KnowledgeEntry entity with useCount + lastUsedAt + supersedes_id
- AgentDefinition entity with prompt_template + default_tools + default_budgets
- Skill entity with skill_md + files + is_global
- IssueMemoryProjector basic (Episodic + Semantic + Working sections from event log)
- 5 sample knowledge entries seeded
- 7 agent definitions seeded (stub prompts)

### Pending wiring
- ContextAssembler doesn't currently READ Knowledge / Skills / AgentDefinition
- useCount + lastUsedAt never incremented by query_knowledge tool
- Decay reaper doesn't exist (90-day unused entries → archive)
- AgentDefinition.skill_refs not resolved into Skill content injection
- Reference plugin doesn't exist

### ECC adoption decisions (from prior brainstorm)
- 10 agent prompts to vendor: architect, code-reviewer, code-explorer, code-simplifier, build-error-resolver, doc-updater, e2e-runner, chief-of-staff, harness-optimizer, fastapi-reviewer
- 15 skills to vendor: agent-harness-construction, autonomous-loops, agent-eval, agent-introspection-debugging, agent-architecture-audit, api-design, architecture-decision-records, backend-patterns, benchmark, agentic-engineering, autonomous-agent-harness, ai-first-engineering, agentic-os, api-connector-builder, brand-voice
- Vendor at pinned ECC commit; preserve LICENSE + attribution

---

## Requirements

### Functional
- F1. ContextAssembler queries Knowledge entries by `scope_globs` overlap with current issue scope_hints + tags overlap
- F2. ContextAssembler injects top 3-5 relevant Knowledge entries into prompt (cap by token budget)
- F3. `query_knowledge` tool increments useCount + sets lastUsedAt on each retrieved entry
- F4. Decay reaper (cron / scheduled task): archive entries unused 90+ days
- F5. AgentDefinition full integration: harness loads template + tools + budgets per session
- F6. Skill content injection: AgentDefinition.skill_refs → Skill rows → skill_md prepended to system prompt
- F7. IssueMemoryProjector enriched: include past lessons-learned events
- F8. Reference plugin `bumblebee-plugin-example/` ships 1 workflow + 1 agent + 1 skill via entry_points
- F9. Plugin install via `pip install -e bumblebee-plugin-example/` + `bumblebee plugins reload` → workflow visible
- F10. ECC vendor: 10 agent prompts + 15 skills imported into seed_default
- F11. Prompt Defense Baseline prefix on every AgentDefinition.prompt_template

### Non-functional
- N1. ContextAssembler retrieval <100ms per session start
- N2. Skill content injection adds <5K tokens to prompt
- N3. Decay reaper runs <30s for 10K entries
- N4. Reference plugin install + reload <10s

---

## Architecture

### ContextAssembler — Knowledge Integration

```python
# bumblebee/services/execution/context_assembler.py (v2)
async def assemble_context(session, agent_def, db):
    # 1. System: Defense Baseline + agent_def.prompt_template
    system = DEFENSE_BASELINE + "\n\n" + agent_def.prompt_template
    
    # 2. Skill injection (if agent_def.skill_refs)
    for skill_id in agent_def.skill_refs:
        skill = await db.get(Skill, skill_id)
        if skill: system += "\n\n## Skill: " + skill.skill_md
    
    # 3. Knowledge: query by scope + tags
    relevant = await query_relevant_knowledge(
        db, project_id=session.issue.project_id,
        scope_hints=session.issue.scope_hints,
        tags=infer_tags_from_role(agent_def.role),
        limit=5,
    )
    if relevant:
        system += "\n\n## Project Knowledge\n"
        for k in relevant:
            system += f"- [{k.category}] {k.title}: {k.body[:200]}\n"
            # Side effect: increment useCount + lastUsedAt
            await mark_used(db, k)
    
    # 4. IssueMemory if continuation
    issue_mem = await project_issue_memory(db, session.issue_id)
    if issue_mem["semantic"]:
        system += "\n\n## Issue Memory\n" + format_memory(issue_mem)
    
    # 5. Tools (filtered by role)
    tools = [t for t in TOOLS.values() if agent_def.role in t.roles or "all" in t.roles]
    
    return Prompt(system=system, tools=tools, user=build_user_msg(session))
```

### Knowledge Retrieval

```python
async def query_relevant_knowledge(db, project_id, scope_hints, tags, limit=5):
    # Scope match: ANY entry.scope_globs overlaps ANY scope_hint
    # Tag match: ANY entry.tags overlap any inferred tag
    # Order: weight = use_count * recency_factor
    
    stmt = (
        select(KnowledgeEntry)
        .where(KnowledgeEntry.project_id == project_id)
        .where(or_(
            scope_overlap_clause(scope_hints),
            tag_overlap_clause(tags),
        ))
        .order_by(
            (KnowledgeEntry.use_count + 1).desc(),
            KnowledgeEntry.last_used_at.desc().nullslast(),
        )
        .limit(limit)
    )
    return (await db.execute(stmt)).scalars().all()
```

### Reference Plugin Structure

```
bumblebee-plugin-example/
├── pyproject.toml                # entry_points declared
├── README.md
├── LICENSE
├── bumblebee_plugin_example/
│   ├── __init__.py               # exports `manifest` dict
│   ├── workflows/
│   │   └── example-hello.yaml
│   ├── agent_defs/
│   │   └── greeter.md
│   └── skills/
│       └── hello-skill/
│           └── SKILL.md
└── tests/
    └── test_example.py
```

```python
# bumblebee_plugin_example/__init__.py
from pathlib import Path
ROOT = Path(__file__).parent
manifest = {
    "name": "example",
    "version": "0.1.0",
    "workflows": list((ROOT / "workflows").glob("*.yaml")),
    "agent_defs": list((ROOT / "agent_defs").glob("*.md")),
    "skills": list((ROOT / "skills").glob("*/SKILL.md")),
    "tools": [],
}
```

```toml
# pyproject.toml
[project]
name = "bumblebee-plugin-example"
dependencies = ["bumblebee-ai>=0.3.0"]

[project.entry-points."bumblebee.plugins"]
example = "bumblebee_plugin_example:manifest"
```

---

## Related Code Files

### Modify

| File | Change |
|---|---|
| `bumblebee/services/execution/context_assembler.py` | Add Skill + Knowledge + AgentDef injection |
| `bumblebee/services/tool/handlers/knowledge.py` | query_knowledge increments useCount + lastUsedAt |
| `bumblebee/services/execution/harness.py` | Use AgentDefinition.default_budgets when creating session |
| `bumblebee/seeds/seed_default.py` | Replace placeholder prompts with 10 vendored ECC prompts + 15 skills |
| `bumblebee/services/state/issue_memory.py` | Add knowledge_used events to Semantic section |

### Create

| File | Purpose |
|---|---|
| `bumblebee/services/knowledge/__init__.py` | Knowledge module |
| `bumblebee/services/knowledge/retrieval.py` | scope+tag query + ranking |
| `bumblebee/services/knowledge/decay_reaper.py` | Background task to archive stale entries |
| `bumblebee/services/knowledge/seed_ecc.py` | Vendor ECC content (one-time importer) |
| `bumblebee/services/knowledge/defense_baseline.py` | Reusable prompt prefix |
| `bumblebee/data/ecc-vendored/agents/*.md` | 10 vendored ECC agent prompts (LICENSE preserved) |
| `bumblebee/data/ecc-vendored/skills/*/SKILL.md` | 15 vendored ECC skills |
| `bumblebee/data/ecc-vendored/LICENSE` | ECC MIT LICENSE attribution |
| `bumblebee/data/ecc-vendored/VENDOR.md` | Source commit + sync policy |
| `bumblebee-plugin-example/` (new repo or subdir) | Reference plugin |
| `docs/plugin-spec.md` | Full spec (v1.1.1 expanded) |
| `docs/knowledge-system.md` | Knowledge usage guide |
| `tests/test_knowledge_retrieval.py` | Retrieval + ranking + usage tracking |
| `tests/test_decay_reaper.py` | Archive logic |
| `tests/test_reference_plugin.py` | Install + load + workflow runs |

### Delete

- (none)

---

## Implementation Steps

### Week 1 — Context Assembler + Knowledge

1. **Day 1: Defense Baseline + AgentDefinition wiring**
   - Create `defense_baseline.py` with 6-line ECC prefix
   - Update harness: load AgentDefinition row at session start; use prompt_template + default_tools + default_budgets

2. **Day 2: ContextAssembler v2**
   - Inject Defense Baseline + AgentDef prompt + Skill content + Knowledge entries
   - Token budget tracking; truncate by priority if over

3. **Day 3: Knowledge retrieval + scoring**
   - `retrieval.py`: scope_globs overlap (use file-set intersection) + tag overlap
   - Ranking: use_count * recency
   - Mark used: increment useCount + set lastUsedAt

4. **Day 4: Skill loading**
   - AgentDefinition.skill_refs → fetch Skill rows → inject skill_md
   - Cap injection size (per skill 2K tokens max)
   - Test: agent loads 3 skills, all visible in final prompt

5. **Day 5: Decay reaper**
   - Background task scheduled every 24h
   - Archive: set `deleted_at` on KnowledgeEntry where `last_used_at < now - 90d` AND use_count < threshold
   - Test with time-shifted fixtures

### Week 2 — ECC vendor + reference plugin

6. **Day 6: ECC vendor importer**
   - `seed_ecc.py`: parse 10 agent .md files + 15 skill dirs from `bumblebee/data/ecc-vendored/`
   - Insert into AgentDefinition + Skill tables on first seed
   - Preserve LICENSE in `data/ecc-vendored/LICENSE`
   - Update README.md attribution

7. **Day 7-8: Reference plugin**
   - Create `bumblebee-plugin-example/` (subdir or sister repo)
   - Author 1 workflow (`example-hello.yaml`) + 1 agent (`greeter.md`) + 1 skill (`hello-skill/`)
   - pyproject + entry_points + manifest

8. **Day 9: Plugin install test**
   - `pip install -e bumblebee-plugin-example/`
   - `bumblebee plugins reload`
   - Verify: workflow visible in `bumblebee plugins list`; can run `example-hello` workflow

9. **Day 10: docs/plugin-spec.md + knowledge-system.md**
   - Full plugin spec with naming, lifecycle, isolation, version policy
   - Knowledge system user guide

10. **Day 11: Acceptance + commit**
    - Run scenario: Implementer agent on auth issue → Context Assembler pulls "auth uses bcrypt" knowledge → agent uses it in solution
    - Run scenario: reference plugin workflow executes
    - Commit: `feat(phase-6): knowledge integration + ECC vendor + reference plugin`

---

## Todo List

- [ ] Defense Baseline prefix module
- [ ] AgentDefinition full integration in harness
- [ ] ContextAssembler v2 (Skill+Knowledge+IssueMem)
- [ ] Knowledge retrieval scope+tag query
- [ ] Knowledge use_count + lastUsedAt increment
- [ ] Skill content injection (cap tokens)
- [ ] Decay reaper background task
- [ ] ECC vendor: 10 agents + 15 skills
- [ ] LICENSE + VENDOR.md preserved
- [ ] seed_ecc.py importer
- [ ] bumblebee-plugin-example/ reference
- [ ] Plugin install + reload + run test
- [ ] docs/plugin-spec.md
- [ ] docs/knowledge-system.md
- [ ] tests/test_knowledge_retrieval
- [ ] tests/test_decay_reaper
- [ ] tests/test_reference_plugin
- [ ] Phase 6 commit

---

## Success Criteria

| Criterion | Verification |
|---|---|
| Implementer agent uses Knowledge entry in solution | manual: seed "auth uses bcrypt"; run auth-fix issue; verify context includes |
| query_knowledge increments useCount | test verifies count delta |
| Decay reaper archives unused entries | time-shifted test |
| Skill content visible in prompt | test inspect final prompt string |
| Reference plugin installs + runs workflow | `pip install -e` + smoke test |
| ECC vendored agents seeded correctly | DB row count + LICENSE present |
| Defense Baseline on every prompt | grep across rendered prompts |

---

## Risk Assessment

| Risk | P | I | Mitigation |
|---|---|---|---|
| Knowledge retrieval too broad (returns irrelevant) | M | M | Strict scope_globs + tag intersection; limit 5; manual review weekly |
| Context bloat from Skills + Knowledge | M | M | Token budget enforced; truncate lowest-priority first |
| ECC content license drift | L | M | Pin commit; VENDOR.md tracks version + sync date |
| Reference plugin breaks on minor schema change | M | L | Plugin pins bumblebee-ai>=0.3.0; semver enforced |
| Decay reaper deletes useful old entries | M | M | Soft delete (deleted_at); restorable; threshold tunable |

---

## Security Considerations

- **Knowledge injection = potential prompt injection**: knowledge entries are project-internal (added by trusted agents); Defense Baseline applies; entries from chat (Phase 7 HITL) are pre-approved
- **Plugin content trust**: reference plugin is internal; future external plugins → per-plugin trust flag (Phase 7+)
- **ECC vendor security**: pinned commit + checksum (TODO: add commit SHA to VENDOR.md)
- **Knowledge query SQL injection**: parameterized queries (SQLAlchemy ORM) — no raw SQL

---

## Next Steps

**Unblocks:**
- Production deploy — knowledge layer makes agents substantially smarter
- Phase 7 (ChatSession) — uses knowledge query tools

**Depends on:**
- Phase 3 (PluginLoader) — for reference plugin loading
- ECC license review (ongoing)

---

## Unresolved Questions

1. **BM25 search**: 2026 research recommends BM25 over raw LIKE. Phase 6 day 3: start with LIKE; add `pg_trgm` GIN index + ts_vector if measured insufficient.
2. **Skill version conflict**: 2 plugins both define "hello-skill" v1.0.0 — namespace by plugin? Defer; Phase 6 baseline: skill name+version unique per project.
3. **Decay threshold tuning**: 90 days too aggressive? Configurable per project; default conservative.
4. **ECC sync cadence**: quarterly review for new content? Defer to ops phase.
5. **Knowledge usage tracking granularity**: per-call increment or per-session? Per-call simpler; per-session more accurate (prevent inflation). Phase 6 day 3 decision.
