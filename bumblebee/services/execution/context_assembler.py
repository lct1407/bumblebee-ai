"""ContextAssembler — build LLM prompt with Defense Baseline + system + Knowledge + IssueMemory."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_definition import AgentDefinition
from bumblebee.models.agent_session import AgentSession
from bumblebee.models.issue import Issue
from bumblebee.models.knowledge_entry import KnowledgeEntry
from bumblebee.models.skill import Skill
from bumblebee.services.knowledge.defense_baseline import DEFENSE_BASELINE
from bumblebee.prompts.loader import get_prompt as get_yaml_prompt
from bumblebee.services.state.issue_memory import project_issue_memory
from bumblebee.services.tool.registry import TOOLS, tools_for_role


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
            AgentDefinition.role == session.role, AgentDefinition.is_global == True
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
        issue = await db.get(Issue, session.issue_id)
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

    # 6. Issue context
    user_parts: list[str] = []
    if issue:
        user_parts.append(f"# Issue: BB-{issue.number}: {issue.title}")
        if issue.description:
            user_parts.append(issue.description)
        if issue.scope_hints:
            user_parts.append(f"Scope hints: {', '.join(issue.scope_hints)}")
        if issue.acceptance_criteria:
            user_parts.append(f"Acceptance: {issue.acceptance_criteria}")

    # 7. User message
    if user_message:
        user_parts.append(f"\n## User\n{user_message}")

    system = "\n\n".join(parts)
    user = "\n\n".join(user_parts) if user_parts else "(continue with the role's primary objective)"

    # Tools — role-filtered
    role = (agent_def.role if agent_def else session.role) or "all"
    tool_defs = tools_for_role(role)

    return Prompt(system=system, user=user, tools=tool_defs)


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
    # Filter by scope overlap (prefix match) — KISS for now
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
