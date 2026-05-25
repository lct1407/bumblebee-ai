"""Install Bumblebee role prompts + workflows into external AI agent toolchains.

Targets:
  claude-code:  writes to <repo>/.claude/agents/bumblebee-<role>.md
                + <repo>/.claude/skills/bumblebee/SKILL.md
  cursor:       writes to <repo>/.cursor/rules/bumblebee-<role>.mdc
  codex:        writes to <repo>/AGENTS.md (appended, idempotent)
  generic:      writes to <repo>/.bumblebee/agents/<role>.md (vendor-neutral)

Each role file is plain markdown so any LLM can read it without parsing YAML.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import yaml

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"


BUMBLEBEE_BUNDLE_HEADER = "<!-- bumblebee-bundle:start -->"
BUMBLEBEE_BUNDLE_FOOTER = "<!-- bumblebee-bundle:end -->"


def _load_role(role: str) -> dict:
    path = PROMPTS_DIR / f"{role}.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _all_roles() -> list[str]:
    roles = []
    for p in sorted(PROMPTS_DIR.glob("*.yaml")):
        if p.name.startswith("_"):
            continue
        roles.append(p.stem)
    return roles


def _role_to_markdown(role: str, spec: dict) -> str:
    name = spec.get("display_name") or spec.get("name") or role
    description = spec.get("description", "")
    system = spec.get("system", "")
    tools = spec.get("tools_allowed", [])
    budgets = spec.get("budgets") or {}

    parts = [
        f"# Bumblebee role: {name}",
        "",
        f"_Role key: `{role}`_",
        "",
        "## Purpose",
        description,
        "",
        "## System prompt",
        "```",
        system.strip(),
        "```",
    ]
    if tools:
        parts += ["", "## Allowed tools", *(f"- {t}" for t in tools)]
    if budgets:
        parts += ["", "## Budgets",
                  *(f"- {k}: {v}" for k, v in budgets.items())]
    parts += ["",
              "## How to use this in an AI coding assistant",
              "Cite this file when asked to act as the Bumblebee "
              f"`{role}` role. Follow the system prompt verbatim; respect the budgets above; "
              "limit tool usage to the allowed list."]
    return "\n".join(parts) + "\n"


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


# ---- Target writers ------------------------------------------------------


def _install_claude_code(repo: Path) -> list[Path]:
    written = []
    agents_dir = repo / ".claude" / "agents"
    skills_dir = repo / ".claude" / "skills" / "bumblebee"

    for role in _all_roles():
        spec = _load_role(role)
        md = _role_to_markdown(role, spec)
        p = agents_dir / f"bumblebee-{role}.md"
        _write(p, md)
        written.append(p)

    skill_md = skills_dir / "SKILL.md"
    skill_body = (
        "# Bumblebee role library\n\n"
        "Role prompts copied from the Bumblebee multi-agent platform "
        "(https://github.com/lct1407/bumblebee). Use these when asked to "
        "act as a Triager / Implementer / Reviewer / etc.\n\n"
        "## Roles available\n\n"
        + "\n".join(f"- `bumblebee-{r}` → see ../../agents/bumblebee-{r}.md" for r in _all_roles())
        + "\n"
    )
    _write(skill_md, skill_body)
    written.append(skill_md)

    # Workflows
    for wf in sorted(WORKFLOWS_DIR.glob("*.yaml")):
        p = repo / ".claude" / "workflows" / wf.name
        _write(p, wf.read_text(encoding="utf-8"))
        written.append(p)
    return written


def _install_cursor(repo: Path) -> list[Path]:
    written = []
    rules = repo / ".cursor" / "rules"
    for role in _all_roles():
        spec = _load_role(role)
        # Cursor uses .mdc with frontmatter
        body = (
            "---\n"
            f"description: Bumblebee {role} role — see role markdown for full system prompt.\n"
            "globs: [\"**/*\"]\n"
            "alwaysApply: false\n"
            "---\n\n"
            + _role_to_markdown(role, spec)
        )
        p = rules / f"bumblebee-{role}.mdc"
        _write(p, body)
        written.append(p)
    return written


def _install_codex(repo: Path) -> list[Path]:
    """Codex reads AGENTS.md. Append a Bumblebee block between markers."""
    target = repo / "AGENTS.md"
    block = [BUMBLEBEE_BUNDLE_HEADER, "", "## Bumblebee role library", ""]
    for role in _all_roles():
        spec = _load_role(role)
        name = spec.get("display_name") or role
        desc = spec.get("description", "").strip()
        block.append(f"### {name} (`{role}`)")
        block.append(desc)
        block.append("")
        block.append("```")
        block.append((spec.get("system") or "").strip())
        block.append("```")
        block.append("")
    block.append(BUMBLEBEE_BUNDLE_FOOTER)
    insert = "\n".join(block)

    existing = target.read_text(encoding="utf-8") if target.exists() else ""
    if BUMBLEBEE_BUNDLE_HEADER in existing and BUMBLEBEE_BUNDLE_FOOTER in existing:
        # Replace block (idempotent)
        before, _, rest = existing.partition(BUMBLEBEE_BUNDLE_HEADER)
        _, _, after = rest.partition(BUMBLEBEE_BUNDLE_FOOTER)
        new = before.rstrip() + "\n\n" + insert + "\n" + after.lstrip()
    else:
        new = existing.rstrip() + "\n\n" + insert + "\n"
    _write(target, new)
    return [target]


def _install_generic(repo: Path) -> list[Path]:
    written = []
    base = repo / ".bumblebee" / "agents"
    for role in _all_roles():
        spec = _load_role(role)
        p = base / f"{role}.md"
        _write(p, _role_to_markdown(role, spec))
        written.append(p)
    for wf in sorted(WORKFLOWS_DIR.glob("*.yaml")):
        p = repo / ".bumblebee" / "workflows" / wf.name
        _write(p, wf.read_text(encoding="utf-8"))
        written.append(p)
    return written


@dataclass(frozen=True)
class Target:
    key: str
    label: str
    installer: Callable[[Path], list[Path]]


TARGETS: dict[str, Target] = {
    "claude-code": Target("claude-code", "Claude Code (.claude/agents)", _install_claude_code),
    "cursor": Target("cursor", "Cursor IDE (.cursor/rules)", _install_cursor),
    "codex": Target("codex", "OpenAI Codex (AGENTS.md)", _install_codex),
    "generic": Target("generic", "Vendor-neutral (.bumblebee/)", _install_generic),
}


def install_bundle(target_key: str, repo: Path) -> list[Path]:
    """Install the Bumblebee role+workflow bundle into the given repo."""
    if target_key not in TARGETS:
        raise ValueError(f"unknown target: {target_key} (choose one of {list(TARGETS)})")
    target = TARGETS[target_key]
    if not repo.exists():
        raise FileNotFoundError(f"repo path does not exist: {repo}")
    return target.installer(repo)
