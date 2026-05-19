# Changelog

All notable changes to **bumblebee-ai** documented here.

## [0.3.0] — 2026-05-19 (rc1)

### Added

- **Greenfield v3 platform** — multi-agent concurrent task management with 7-plane architecture
- **Workflow engine** — LangGraph + YAML declarative workflow loader
- **Event log** — append-only canonical state (`events` table)
- **ScopeLease** — atomic file-glob claim for multi-agent concurrent execution
- **Tool registry** — 13 single-verb tools with strict JSON schema validation + role filtering
- **Tool executor** — dispatcher with `ToolResult` schema (status/summary/next_actions/artifacts)
- **ContextAssembler** — Prompt Defense Baseline + role prompt + Skills + Knowledge + IssueMemory
- **LLM provider abstraction** — stub + claude-cli; OpenAI/Gemini stubs ready
- **Safety plane** — BudgetEnforcer (3 scopes), LoopDetector, FailureClassifier, MitigationActuator
- **Plugin system** — Python `entry_points` discovery; `bumblebee-plugin-example` reference plugin
- **Coordinator** — Phase 4 multi-specialist decomposition + dispatch
- **Notifications** — first-class entity with dispatcher + REST endpoints
- **Replay debugger** — event log → reconstructed trace
- **Eval harness** — agent-eval YAML schema + pytest/grep/regex/exit_code judges + pass@k runner
- **OTel trace emitter** — observability scaffold
- **CLI** — `bumblebee` console script: init / db / server / plugins / issue / chat / replay
- **Database** — 14 entities + plugin_registrations; Alembic migrations
- **Tests** — 75 passing across 11 test modules

### Distribution

- pypi package name: **`bumblebee-ai`** (`bumblebee` was abandoned 2011 lib; PEP 541 takeover pending)
- npm scope reserved: `@bumblebee` (TS extensions Phase 6+)

### Documentation

- [Architecture](docs/architecture.md) — 7-plane reference
- [Plan](docs/plan.md) — full design (v1.1.1 locked)
- [Getting started](docs/getting-started.md) — install + first run
- [Phases status](docs/phases-status.md) — per-phase progress tracking

### Anti-scope

- Vector DB / embeddings (2026 standards confirm structured + BM25 default)
- Mobile app, embeddable widget
- ChatSession Tier 3 (orchestration control surface)
- Multi-tenancy
- Plugin marketplace, sandboxing, signing

### Known limitations (planned post-rc1)

- claude-cli execution requires real binary + API key (stub fallback in tests)
- LangGraph multi-node traversal scaffolded; full workflow execution in Phase 1.5+
- Next.js web UI deferred to Phase 4 implementation cycle
- ECC content vendor (10 agent prompts + 15 skills) deferred to Phase 6 execution
- TestPyPI smoke test on 3 OS pending CI runner setup

## [Pre-history]

- 2026-05-12 — Go-based `bumblebee` rebuild attempt (separate repo `lct1407/bumblebee`)
- 2026-02-27 — Bumblebee v2 release candidate (current `Bumblebee-cli`)
