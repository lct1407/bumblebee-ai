"""ContextAssembler — build LLM prompt with Defense Baseline + system + Knowledge + IssueMemory."""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_definition import AgentDefinition
from bumblebee.models.agent_session import AgentSession
from bumblebee.models.issue import Issue
from bumblebee.models.knowledge_entry import KnowledgeEntry
from bumblebee.models.skill import Skill
from bumblebee.prompts.loader import get_prompt as get_yaml_prompt
from bumblebee.services.knowledge.defense_baseline import DEFENSE_BASELINE
from bumblebee.services.state.issue_memory import project_issue_memory
from bumblebee.services.tool.registry import tools_for_role


@dataclass
class Prompt:
    system: str
    user: str
    tools: list = field(default_factory=list)

    @property
    def estimated_tokens(self) -> int:
        return (len(self.system) + len(self.user)) // 4  # char/4 heuristic


async def assemble_context(
    db: AsyncSession,
    session: AgentSession,
    user_message: str | None = None,
) -> Prompt:
    """Assemble final prompt for LLM call.

    Composition (in priority order, may truncate from bottom if over budget):
    1. Defense Baseline (always)
    2. AgentDefinition.prompt_template
    3. Skill content (referenced skills)
    4. Project Knowledge (scope+tag relevant; top 5)
    5. IssueMemory (Episodic + Semantic summaries)
    6. Issue title/description
    7. User message
    """
    parts: list[str] = [DEFENSE_BASELINE]

    # 2. Role prompt — Phase C prefers externalised YAML over inline AgentDefinition.
    # If a YAML prompt exists for this role, use it. Falls back to DB AgentDefinition
    # for backwards compatibility (legacy roles seeded but not yet externalised).
    agent_def = None
    role_for_prompt = session.role
    if session.agent_definition_id:
        agent_def = await db.get(AgentDefinition, session.agent_definition_id)
        if agent_def and agent_def.role:
            role_for_prompt = agent_def.role
    elif session.role:
        stmt = select(AgentDefinition).where(
            AgentDefinition.role == session.role, AgentDefinition.is_global
        )
        agent_def = (await db.execute(stmt)).scalar_one_or_none()

    yaml_prompt = None
    if role_for_prompt:
        try:
            yaml_prompt = get_yaml_prompt(role_for_prompt)
        except KeyError:
            yaml_prompt = None

    if yaml_prompt:
        parts.append(f"## Role: {yaml_prompt.display_name}\n\n{yaml_prompt.system.strip()}")
        if yaml_prompt.output_schema:
            import json as _json
            parts.append(
                f"## Output schema (MUST match exactly)\n```json\n"
                f"{_json.dumps(yaml_prompt.output_schema, indent=2)}\n```"
            )
    elif agent_def:
        parts.append(f"## Role: {agent_def.name}\n\n{agent_def.prompt_template}")

    # Tools — role-filtered catalog rendered into the system prompt so providers
    # without native function calling can still request tools (text protocol).
    role = (agent_def.role if agent_def else session.role) or "all"
    tool_defs = tools_for_role(role)
    if tool_defs:
        parts.append(_render_tool_catalog(tool_defs))

    # 3. Skills (if AgentDefinition has skill refs)
    if agent_def and agent_def.skill_refs:
        for ref in agent_def.skill_refs[:3]:  # cap 3 skills to limit tokens
            try:
                skill = await db.get(Skill, ref)
                if skill:
                    parts.append(f"## Skill: {skill.name}\n\n{skill.skill_md[:2000]}")
            except Exception:
                continue

    # 4. Knowledge entries (scope match)
    issue = None
    if session.issue_id:
        # Eager-load project: _collect_source_snippets reads issue.project and a
        # sync lazy-load inside the async session raises MissingGreenlet.
        from sqlalchemy.orm import selectinload
        issue = (await db.execute(
            select(Issue)
            .options(selectinload(Issue.project))
            .where(Issue.id == session.issue_id)
        )).scalar_one_or_none()
    if issue:
        knowledge = await _relevant_knowledge(db, issue, limit=5)
        if knowledge:
            knowledge_block = "## Project Knowledge\n"
            for k in knowledge:
                knowledge_block += f"- [{k.category.value}] {k.title}: {k.body[:200]}\n"
            parts.append(knowledge_block)

        # 5. IssueMemory
        try:
            memory = await project_issue_memory(db, issue.id)
            if memory.get("semantic"):
                mem_block = "## Issue Memory\n"
                if "complexity" in memory["semantic"]:
                    mem_block += f"- Complexity: {memory['semantic']['complexity']}\n"
                if "plan_summary" in memory["semantic"]:
                    mem_block += f"- Plan: {memory['semantic']['plan_summary']}\n"
                if memory.get("episodic"):
                    mem_block += f"- Past events: {len(memory['episodic'])}\n"
                parts.append(mem_block)
        except Exception:
            pass

    # 6. Issue context + BB-5: source-aware (read files matching scope_hints)
    user_parts: list[str] = []
    if issue:
        user_parts.append(f"# Issue: BB-{issue.number}: {issue.title}")
        if issue.description:
            user_parts.append(issue.description)
        if issue.scope_hints:
            user_parts.append(f"Scope hints: {', '.join(issue.scope_hints)}")
        if issue.acceptance_criteria:
            user_parts.append(f"Acceptance: {issue.acceptance_criteria}")

        # BB-5: pull actual file contents matching scope_hints (best-effort,
        # bounded budget). Only kicks in if project has repo_path and globs
        # resolve to real files. Skipped when running on server without repo.
        snippets = _collect_source_snippets(issue)
        if snippets:
            user_parts.append("## Source code (scoped)\n" + snippets)

    # 7. User message
    if user_message:
        user_parts.append(f"\n## User\n{user_message}")

    system = "\n\n".join(parts)
    user = "\n\n".join(user_parts) if user_parts else "(continue with the role's primary objective)"

    return Prompt(system=system, user=user, tools=tool_defs)


def _render_tool_catalog(tool_defs: list) -> str:
    """Render the tool catalog + text call protocol for the system prompt."""
    import json as _json
    lines = [
        "## Tool calling protocol",
        "You may call the tools below. To call one, reply with ONLY this JSON "
        '(no prose): {"tool_call": {"name": "<tool_name>", "args": {...}}}',
        "The result will be fed back to you; then produce your final answer.",
        "",
        "Available tools:",
    ]
    for t in tool_defs:
        lines.append(f"- {t.name}: {t.description} args: {_json.dumps(t.args_schema)}")
    return "\n".join(lines)


# BB-5 — top-level helper for daemon-side reuse.
SOURCE_BUDGET_BYTES = 200_000          # ~50K tokens
PER_FILE_HEAD_BYTES = 16_000           # avoid 1 big file eating budget
SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", "dist", ".next"}


async def _relevant_knowledge(
    db: AsyncSession, issue: Issue, limit: int = 5
) -> list[KnowledgeEntry]:
    """Pick top-N knowledge entries by scope_globs overlap + use_count."""
    stmt = (
        select(KnowledgeEntry)
        .where(KnowledgeEntry.project_id == issue.project_id)
        .order_by((KnowledgeEntry.use_count + 1).desc())
        .limit(limit * 3)
    )
    candidates = (await db.execute(stmt)).scalars().all()
    if not issue.scope_hints:
        return list(candidates[:limit])
    scored: list[tuple[int, KnowledgeEntry]] = []
    for k in candidates:
        score = 0
        for hint in issue.scope_hints:
            for kg in (k.scope_globs or []):
                a = hint.split("*", 1)[0].rstrip("/")
                b = kg.split("*", 1)[0].rstrip("/")
                if a and b and (a.startswith(b) or b.startswith(a)):
                    score += 1
        scored.append((score, k))
    scored.sort(key=lambda x: (-x[0], -(x[1].use_count or 0)))
    return [k for _, k in scored[:limit]]


def _collect_source_snippets(issue) -> str:
    """Read up to SOURCE_BUDGET_BYTES of source matching issue.scope_hints.

    Returns concatenated `# path\n```\n<contents>\n``` blocks, oldest first.
    Skipped silently if project.repo_path is None or not on local fs (server
    runs context assembly — files only present when on the worker device).
    """
    import fnmatch
    from pathlib import Path
    project = getattr(issue, "project", None)
    if not project:
        return ""
    repo = getattr(project, "repo_path", None)
    if not repo:
        return ""
    base = Path(repo).expanduser()
    if not base.exists() or not base.is_dir():
        return ""
    hints = issue.scope_hints or []
    if not hints:
        return ""

    selected: list[Path] = []
    seen: set[Path] = set()
    for hint in hints:
        # Allow both 'src/x.py' and 'src/**/*.py' style
        try:
            matches = list(base.glob(hint)) if any(c in hint for c in "*?[") else \
                      [base / hint] if (base / hint).exists() else []
        except Exception:
            matches = []
        # Also fnmatch against the file walk (cheap, bounded)
        if not matches:
            for path in base.rglob("*"):
                if any(skip in path.parts for skip in SKIP_DIRS):
                    continue
                rel = path.relative_to(base).as_posix()
                if fnmatch.fnmatch(rel, hint):
                    matches.append(path)
                if len(matches) >= 50:
                    break
        for m in matches[:20]:
            if m in seen or not m.is_file():
                continue
            seen.add(m)
            selected.append(m)

    if not selected:
        return ""

    out_chunks: list[str] = []
    used = 0
    for p in selected:
        try:
            data = p.read_bytes()
        except Exception:
            continue
        head = data[:PER_FILE_HEAD_BYTES]
        if used + len(head) > SOURCE_BUDGET_BYTES:
            break
        try:
            text_body = head.decode("utf-8", errors="replace")
        except Exception:
            continue
        rel = p.relative_to(base).as_posix()
        ext = p.suffix.lstrip(".") or ""
        out_chunks.append(f"### {rel}\n```{ext}\n{text_body}\n```")
        used += len(head)
    return "\n\n".join(out_chunks)


