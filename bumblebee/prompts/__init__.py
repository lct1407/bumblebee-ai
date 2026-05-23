"""External agent prompts (Phase C of commercial SaaS plan).

10 named roles + 1 defense baseline, all in YAML so non-engineers can edit
prompts without touching Python. Loaded once at import (cached); hot-reload via
`reload()` in dev.

Roles:
  triager, coordinator, planner, implementer, tester, reviewer, merger,
  documenter, assistant, failure_diagnostician

Plus: `_defense_baseline.yaml` prepended to every assembled prompt.
"""
from bumblebee.prompts.loader import (
    DefenseBaseline,
    Prompt,
    assemble_system_prompt,
    get_defense_baseline,
    get_prompt,
    list_roles,
    reload,
)

__all__ = [
    "DefenseBaseline",
    "Prompt",
    "assemble_system_prompt",
    "get_defense_baseline",
    "get_prompt",
    "list_roles",
    "reload",
]
