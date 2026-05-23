"""YAML prompt loader with caching + schema validation.

Each prompt YAML must declare:
  name, role, system, output_schema, tools_allowed, budgets

The Defense Baseline (`_defense_baseline.yaml`) is loaded separately and
prepended by `assemble_context` to every role's `system` prompt.
"""
from __future__ import annotations
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

log = logging.getLogger(__name__)
PROMPTS_DIR = Path(__file__).parent


@dataclass
class Prompt:
    name: str
    role: str
    display_name: str
    description: str
    version: int
    system: str
    output_schema: dict
    tools_allowed: list[str]
    budgets: dict
    few_shot_examples: list[dict] = field(default_factory=list)


@dataclass
class DefenseBaseline:
    name: str
    version: int
    content: str


_CACHE: dict[str, Prompt] = {}
_BASELINE: DefenseBaseline | None = None


def _load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def reload() -> None:
    """Drop the cache + re-read all YAML files. Use in dev / on prompt edit."""
    global _CACHE, _BASELINE
    _CACHE = {}
    _BASELINE = None
    _ensure_loaded()


def _ensure_loaded() -> None:
    global _BASELINE
    if _BASELINE is None:
        baseline_path = PROMPTS_DIR / "_defense_baseline.yaml"
        if baseline_path.exists():
            d = _load_yaml(baseline_path)
            _BASELINE = DefenseBaseline(
                name=d["name"],
                version=int(d.get("version", 1)),
                content=d["content"],
            )
        else:
            _BASELINE = DefenseBaseline(name="defense_baseline", version=0, content="")

    if _CACHE:
        return

    for yaml_path in PROMPTS_DIR.glob("*.yaml"):
        if yaml_path.name.startswith("_"):
            continue  # baseline + internal files
        d = _load_yaml(yaml_path)
        try:
            p = Prompt(
                name=d["name"],
                role=d["role"],
                display_name=d.get("display_name", d["name"].title()),
                description=d.get("description", ""),
                version=int(d.get("version", 1)),
                system=d["system"],
                output_schema=d.get("output_schema", {}),
                tools_allowed=d.get("tools_allowed", []),
                budgets=d.get("budgets", {}),
                few_shot_examples=d.get("few_shot_examples", []),
            )
        except KeyError as e:
            log.error("prompt %s missing required key %s — skipping", yaml_path.name, e)
            continue
        _CACHE[p.role] = p


def get_prompt(role: str) -> Prompt:
    """Look up a prompt by role name. Raises KeyError if missing."""
    _ensure_loaded()
    if role not in _CACHE:
        raise KeyError(f"no prompt defined for role '{role}'. Available: {sorted(_CACHE.keys())}")
    return _CACHE[role]


def get_defense_baseline() -> DefenseBaseline:
    _ensure_loaded()
    assert _BASELINE is not None
    return _BASELINE


def list_roles() -> list[str]:
    _ensure_loaded()
    return sorted(_CACHE.keys())


def assemble_system_prompt(role: str) -> str:
    """Return the defense-baseline-prepended system prompt for a role."""
    baseline = get_defense_baseline()
    prompt = get_prompt(role)
    if baseline.content:
        return f"{baseline.content.rstrip()}\n\n---\n\n{prompt.system.strip()}"
    return prompt.system.strip()
