"""One-shot rewriter: add WorkspaceScopedMixin to tenant-scoped model classes.

Idempotent — re-running on an already-mixed file is a no-op.
"""
import re
from pathlib import Path

MODELS_DIR = Path(__file__).parent.parent / "bumblebee" / "models"

# Map: model file → class name(s) that need the mixin
TARGETS = {
    "event.py": ["Event"],
    "agent_session.py": ["AgentSession"],
    "workflow.py": ["Workflow"],
    "workflow_run.py": ["WorkflowRun"],
    "knowledge_entry.py": ["KnowledgeEntry"],
    "chat_session.py": ["ChatSession"],
    "notification.py": ["Notification"],
    "scope_lease.py": ["ScopeLease"],
    "comment.py": ["Comment"],
    "agent_definition.py": ["AgentDefinition"],
    "skill.py": ["Skill"],
    "project.py": ["Project"],
}


def rewrite(path: Path, class_names: list[str]) -> tuple[bool, str]:
    text = path.read_text(encoding="utf-8")
    changed = False
    notes = []

    # 1) Ensure import includes WorkspaceScopedMixin
    if "WorkspaceScopedMixin" not in text:
        # Find the existing base-mixin import line and extend it
        m = re.search(
            r"from bumblebee\.models\.base import\s+([^\n]+)", text
        )
        if not m:
            return False, "no base import found — skipping"
        existing = m.group(1).strip().rstrip(",")
        new = f"{existing}, WorkspaceScopedMixin"
        text = text.replace(m.group(0), f"from bumblebee.models.base import {new}", 1)
        changed = True
        notes.append("import added")

    # 2) Mix into each class declaration
    for name in class_names:
        # Match: class Name(Base, ...):
        pattern = re.compile(rf"class\s+{re.escape(name)}\s*\(([^)]+)\)\s*:")
        m = pattern.search(text)
        if not m:
            notes.append(f"class {name} not found")
            continue
        bases = m.group(1)
        if "WorkspaceScopedMixin" in bases:
            notes.append(f"{name}: already mixed")
            continue
        new_bases = bases.rstrip().rstrip(",") + ", WorkspaceScopedMixin"
        text = text.replace(m.group(0), f"class {name}({new_bases}):", 1)
        changed = True
        notes.append(f"{name}: mixed")

    if changed:
        path.write_text(text, encoding="utf-8")
    return changed, "; ".join(notes)


def main() -> None:
    for fname, classes in TARGETS.items():
        p = MODELS_DIR / fname
        if not p.exists():
            print(f"  -- {fname}: not found")
            continue
        changed, note = rewrite(p, classes)
        flag = "[ok]" if changed else "[--]"
        print(f"  {flag} {fname}: {note}")


if __name__ == "__main__":
    main()
