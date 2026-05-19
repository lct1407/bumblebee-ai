"""Reference plugin: contributes 1 workflow + 1 agent def + 1 skill."""
from pathlib import Path

_ROOT = Path(__file__).parent

manifest = {
    "name": "example",
    "version": "0.1.0",
    "workflows": list((_ROOT / "workflows").glob("*.yaml")),
    "agent_defs": list((_ROOT / "agent_defs").glob("*.md")),
    "skills": list((_ROOT / "skills").glob("*/SKILL.md")),
    "tools": [],
}
