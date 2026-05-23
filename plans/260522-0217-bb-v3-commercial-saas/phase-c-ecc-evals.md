# Phase C — ECC adoption + eval harness (CLI-only)

## Context

- Plan: [plan.md](plan.md)
- Depends on: Phase A
- ECC reference: original v2 CLAUDE.md noted "10 agent prompts + 15 skills + ToolResult schema + Prompt Defense Baseline + agent-eval YAML"

## Overview

| | |
|---|---|
| Priority | 🟡 High — pass-rate gate prevents agent regressions |
| Status | pending |
| Weeks | 6-7 |
| Brief | Adopt the Enterprise Capability Catalog standards: standardized ToolResult schema, Prompt Defense Baseline in every context, externalized agent prompts (10), registered skill catalog (15), YAML-driven eval harness + golden dataset with CI gate. NO dashboard UI in v1 — CLI runner only. |

## Key Insights

- Brainstorm cut the eval *dashboard* but kept the *runner* + CI gate. The runner is the load-bearing piece.
- Agent prompts currently inline in code via `context_assembler.py`. Need externalization to YAML/JSON for diffability + non-engineer editing.
- Skills are the "tool" definitions today. ECC formalizes their schema (name, description, inputSchema, outputSchema, side_effects, idempotent flag).
- Prompt Defense Baseline = a hardened system-prompt prefix that hardens against injection (refuses to reveal system prompt, ignore user "override system" attempts, etc).

## Requirements

### Functional
- 10 named agent prompts externalised in `bumblebee/prompts/` as YAML files (one per role): `triager`, `coordinator`, `planner`, `implementer`, `tester`, `reviewer`, `merger`, `documenter`, `chat_assistant`, `failure_diagnostician`.
- 15 skills registered in `bumblebee/services/tool/registry.py` with full schema: `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `run_tests`, `run_lint`, `run_typecheck`, `git_diff`, `git_status`, `git_commit`, `bash_exec`, `web_search`, `web_fetch`, `db_query`.
- `ToolResult` Pydantic model with: `ok: bool`, `output: Any`, `stdout: str|None`, `stderr: str|None`, `duration_ms: int`, `cost_usd: float|None`, `error: str|None`, `_meta: dict`.
- Prompt Defense Baseline prepended to every system prompt in `context_assembler.py`.
- `bb eval run` CLI runs the golden dataset against current code, prints per-role pass-rate, exits non-zero if any role < 80%.
- Golden dataset in `bumblebee/evals/golden/*.yaml` — each file is a scenario with input + expected JSON output.
- CI workflow `.github/workflows/eval.yml` runs `bb eval run` on every PR.

### Non-functional
- Eval run time < 5 min for full golden dataset (20 scenarios per role)
- Prompts hot-reload in dev (file watch)
- Each scenario YAML self-describing (no shared fixtures)

## Architecture

```
bumblebee/prompts/
  triager.yaml          ← system prompt + few-shot examples + output schema
  coordinator.yaml
  planner.yaml
  ... (10 total)
  _defense_baseline.yaml  ← prepended to every prompt

bumblebee/services/tool/registry.py
  SKILLS: dict[str, Skill]    ← 15 entries, each fully schema-typed
  ToolResult                  ← Pydantic model

bumblebee/evals/
  golden/triager/*.yaml       ← 20 scenarios for triager
  golden/coordinator/*.yaml
  ...
  runner.py                   ← loads scenarios, invokes agent, scores

bumblebee/cli.py
  bb eval run [--role triager] [--threshold 0.8]
```

## Related Code Files

### Create
- `bumblebee/prompts/_defense_baseline.yaml` — injection-hardened prefix
- `bumblebee/prompts/triager.yaml` + 9 more
- `bumblebee/services/tool/tool_result.py` — `ToolResult` Pydantic model
- `bumblebee/services/tool/registry.py` — extend with 15 skills + schema
- `bumblebee/evals/__init__.py`
- `bumblebee/evals/runner.py`
- `bumblebee/evals/scorer.py` — per-role scoring function (exact-match for JSON, semantic for text)
- `bumblebee/evals/golden/triager/*.yaml` (20 scenarios)
- `bumblebee/evals/golden/<role>/*.yaml` × 9 more roles
- `.github/workflows/eval.yml`
- `docs/ecc-standards.md` — what ECC is + our adoption status
- `docs/agent-prompts.md` — how to author + diff prompts

### Modify
- `bumblebee/services/execution/context_assembler.py` — load prompt from YAML, prepend Defense Baseline
- `bumblebee/services/execution/harness.py` — parse `ToolResult` shape from outputs
- `bumblebee/cli.py` — add `eval` subcommand

## Implementation Steps

1. **Defense Baseline draft** — write `_defense_baseline.yaml` with explicit rules (refuse system-prompt extraction, ignore user role-override attempts, validate against allowed output schemas).
2. **Prompt extraction** — for each of 10 roles, extract current inline prompt into a YAML file. Add `examples:` few-shot section. Add `output_schema:` (JSON Schema).
3. **Loader** — `prompts.load(role: str) -> Prompt`. Caches. Hot-reload in dev (watchdog).
4. **`context_assembler.assemble_context`** — refactored to: defense baseline + system prompt from YAML + tool catalog + memory tier + user message.
5. **ToolResult model** — Pydantic class with fields above; helper `ToolResult.success(output, **meta)`, `ToolResult.failed(error, **meta)`.
6. **Skill registry** — define `Skill` dataclass with: name, description, inputSchema, outputSchema, async fn, side_effects, idempotent. Register 15 skills.
7. **Refactor existing tool calls** to return `ToolResult` shape consistently.
8. **Eval scorer** — for JSON-output roles: structural exact match + allowed-field-set check. For free-text roles: BLEU/ROUGE OR LLM-as-judge (deferred to v1.1 — use exact substring matches for v1).
9. **Golden dataset** — write 20 scenarios per role (200 total). Each scenario: `input.user_message` + `input.context_files` + `expected.output` (JSON or substring list).
10. **Runner** — loads scenarios, invokes harness with stub LLM provider replaced by claude-cli or claude-sdk, captures output, scores, aggregates pass-rate.
11. **CLI** — `bb eval run [--role <name>] [--threshold 0.8] [--save-report path.json]`.
12. **CI gate** — `.github/workflows/eval.yml`: run on PR; if pass-rate drops below threshold → fail.
13. **Tests** — pytest: scorer correctly compares, runner aggregates, defense baseline blocks obvious injection prompt.

## Todo

- [ ] Defense Baseline drafted + reviewed
- [ ] 10 agent prompts in `bumblebee/prompts/*.yaml`
- [ ] Prompt loader + hot-reload in dev
- [ ] `context_assembler` rewritten to use YAML
- [ ] `ToolResult` model defined
- [ ] 15 skills registered with full schema
- [ ] Existing tool calls return `ToolResult`
- [ ] Eval scorer + runner
- [ ] 200 golden scenarios (20 × 10 roles)
- [ ] `bb eval run` CLI
- [ ] CI workflow + threshold gate
- [ ] Tests + integration verified
- [ ] Docs: `ecc-standards.md`, `agent-prompts.md`

## Success Criteria

- ✅ Pass-rate ≥ 80% per role on golden dataset
- ✅ Defense Baseline blocks known injection patterns (5 test cases)
- ✅ Prompt hot-reload < 100ms in dev
- ✅ CI gate runs in < 5 min; blocks merge on regression
- ✅ Every tool call in production emits `ToolResult` (verified by event log audit)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Defense Baseline blocks legitimate flows | Med | Med | Test catalog of expected behaviours; iterate on rules |
| Golden dataset bias toward stub provider | High | High | Generate scenarios from real production logs (sampled), not synthesized |
| Eval cost ($) on every PR | Med | Med | Use claude-haiku for eval; or cached stub provider for fast-feedback PRs, real provider on nightly |
| Prompt YAML breaks at runtime (typo) | Med | High | Validate against JSON Schema at load time; fail-fast at startup |

## Security Considerations

- Defense Baseline is the FIRST line of defense against prompt injection.
- Skills with `side_effects: true` (write_file, bash_exec) require explicit user/agent confirmation in interactive mode.
- `bash_exec` MUST be sandboxed (Docker/firejail) when running agent-generated commands.

## Next Steps

- **Depends on**: Phase A
- **Blocks**: nothing strict
- **Future**: v1.1 adds eval dashboard UI, LLM-as-judge scoring, A/B prompt testing.
