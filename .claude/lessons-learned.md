# Lessons Learned

---

## 2026-05-17 - Architecture Gap Analysis Must Audit Real Code, Not Just Docs

**Context:** Evaluated bb v2 agent architecture against production agent standards (Anthropic Building Effective Agents, 12-factor agents, harness design, failure taxonomies). Initial gap analysis was done from `CLAUDE.md` + `docs/architecture.md` only. Brainstormer agent re-audited against actual source files and reranked findings.

**Lesson:** Gap analysis from documentation alone systematically mis-ranks priorities. Three concrete misses found by the code audit that doc-level review didn't catch:
1. **Hidden duplicated subsystems** — `pipeline_orchestrator.py` (legacy) and `workflow/executor.py` (v2) both live in the codebase, every bug-fix is doubled. Docs describe only the "current" one.
2. **Wrong-granularity guards** — budget cap exists but at per-project-per-day level (useless against a single runaway session that burns the day's budget in minutes). Docs say "budget warning exists" without granularity.
3. **Half-built capabilities mistaken for missing** — `agent_stream_log` and `SessionCheckpoint` tables already implement ~50% of event-sourcing/replay needs, but aren't used as canonical truth. From docs it looked like "no event log at all."

Doc-only review also over-rated some gaps: context bloat from "50 comments in `continue` phase" was misaimed — actual bloat risk is `session_context` JSONB accumulating per-phase.

**Action:**
- For architecture audits: always pair a `researcher` (standards & patterns) with a `brainstormer` or codebase-grounded agent (real source files). Doc-based critique alone is a guess.
- When listing "missing" capabilities, grep the codebase first — "missing" often means "exists but isn't load-bearing yet."
- Audit *granularity* of safety mechanisms (timeout, budget, retry caps), not just presence/absence. Cap at wrong scope = no cap.
- Look for **coexisting parallel implementations** of the same concern (legacy + v2 side-by-side) — these are the highest-leverage cleanups, but invisible in docs that describe the intended state.

---

## 2026-02-27 - FastAPI Async SQLAlchemy Patterns

**Context:** Built Bumblebee API with async SQLAlchemy + asyncpg.

**Lesson:** Key patterns for async FastAPI + SQLAlchemy 2.0:

**Action:**
- Use `async_sessionmaker` with `expire_on_commit=False` to avoid lazy-load issues
- Use `selectinload()` for eager loading relationships in async context (lazy loading doesn't work with async)
- Always `await db.refresh(obj)` after `db.commit()` to get server-generated fields
- Use `mapped_column` with type annotations (not old `Column()` style)

**Wrong:**
```python
# Lazy load fails in async
story = await db.get(Story, id)
print(story.project.slug)  # MissingGreenlet error
```

**Correct:**
```python
result = await db.execute(
    select(Story).options(selectinload(Story.project)).where(Story.id == id)
)
story = result.scalar_one_or_none()
print(story.project.slug)  # Works
```

---

## 2026-02-27 - Pydantic EmailStr Requires email-validator

**Context:** `pydantic.EmailStr` fails at import time without the extra package.

**Lesson:** Always use `pydantic[email]` in dependencies when using `EmailStr`.

**Action:** In pyproject.toml use `"pydantic[email]>=2.10.0"` not `"pydantic>=2.10.0"`.

---

## 2026-02-27 - Python CLI Package Naming

**Context:** CLI installed via `pip install -e .` with entry point `bb = "src.main:app"` failed with `ModuleNotFoundError: No module named 'src'`.

**Lesson:** Don't use `src` as a package name — it conflicts with other packages. Use a unique name like `bb_cli`.

**Action:** Package directory should match a unique importable name:
```
cli/bb_cli/main.py    # Not cli/src/main.py
```
Entry point: `bb = "bb_cli.main:app"`

---

## 2026-02-27 - Next.js 16 Async Params Pattern

**Context:** Next.js 16 changed page params to be async (Promise-based).

**Lesson:** Use `use()` from React to unwrap params in client components:

**Wrong:**
```tsx
export default function Page({ params }: { params: { slug: string } }) {
```

**Correct:**
```tsx
import { use } from "react";
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
```

---

## 2026-02-27 - Dual Auth Strategy (JWT + API Key)

**Context:** Bumblebee needs auth for both human users (web/CLI) and machine clients (MCP/CI).

**Lesson:** Support both in a single dependency by checking headers in priority order:
1. `X-BB-API-Key` header → hash and lookup in api_keys table
2. `Authorization: Bearer <token>` → decode JWT

Both resolve to the same `User` model, so downstream code is auth-method agnostic.

---

## 2026-02-27 - Auto-Resolution Pattern

**Context:** When all tasks on a story are marked `done`, the story should auto-resolve.

**Lesson:** Check auto-resolution in both the task update AND story update endpoints, since either could trigger the condition. Query all tasks for the story after each update.

---
