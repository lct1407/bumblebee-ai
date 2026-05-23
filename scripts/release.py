"""bumblebee-ai release script — bumps version, generates CHANGELOG stanza, tags, pushes.

Usage:
  python scripts/release.py patch   # 0.4.0 -> 0.4.1
  python scripts/release.py minor   # 0.4.0 -> 0.5.0
  python scripts/release.py major   # 0.4.0 -> 1.0.0
  python scripts/release.py --dry-run minor

Steps:
  1. Read current version from pyproject.toml + bumblebee/__init__.py
  2. Compute next version per bump type
  3. Aggregate git log since previous tag → group by conv-commit type (feat/fix/etc.)
  4. Open $EDITOR (or print) the draft CHANGELOG stanza for user refinement
  5. Write CHANGELOG.md + pyproject.toml + __init__.py
  6. git commit + git tag + push (skipped with --dry-run)

Idempotent: re-running with same version is a no-op (warns).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).parent.parent
PYPROJECT = ROOT / "pyproject.toml"
INIT_PY = ROOT / "bumblebee" / "__init__.py"
WEB_PKG = ROOT / "web" / "package.json"
CHANGELOG = ROOT / "CHANGELOG.md"

CONV_TYPES = {
    "feat": "Added",
    "fix": "Fixed",
    "chore": "Chore",
    "docs": "Docs",
    "refactor": "Changed",
    "perf": "Performance",
    "test": "Tests",
    "build": "Build",
    "ci": "CI",
    "style": "Style",
    "revert": "Reverted",
    "BREAKING": "BREAKING CHANGES",
}


@dataclass
class Commit:
    sha: str
    type: str  # conv-commit type or "other"
    subject: str
    breaking: bool


def _run(*args: str, capture: bool = True) -> str:
    res = subprocess.run(args, cwd=ROOT, capture_output=capture, text=True)
    if res.returncode != 0:
        sys.exit(f"command failed: {' '.join(args)}\n{res.stderr}")
    return res.stdout.strip()


def _current_version() -> str:
    text = PYPROJECT.read_text(encoding="utf-8")
    m = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
    if not m:
        sys.exit("could not find version in pyproject.toml")
    return m.group(1)


def _bump(version: str, kind: str) -> str:
    major, minor, patch = map(int, version.split("."))
    if kind == "major":
        return f"{major + 1}.0.0"
    if kind == "minor":
        return f"{major}.{minor + 1}.0"
    if kind == "patch":
        return f"{major}.{minor}.{patch + 1}"
    sys.exit(f"unknown bump kind: {kind}")


def _last_tag() -> str | None:
    res = subprocess.run(
        ["git", "describe", "--tags", "--abbrev=0"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return res.stdout.strip() if res.returncode == 0 else None


def _commits_since(tag: str | None) -> list[Commit]:
    range_arg = f"{tag}..HEAD" if tag else "HEAD"
    log = _run("git", "log", range_arg, "--pretty=format:%h\t%s")
    commits: list[Commit] = []
    for line in log.splitlines():
        if not line.strip():
            continue
        sha, _, subject = line.partition("\t")
        # Parse conventional commit type: type(scope)?!: subject
        m = re.match(r"^(\w+)(\([^)]+\))?(!?):\s*(.+)$", subject)
        if m:
            ctype, _scope, bang, msg = m.groups()
            ctype = ctype.lower()
            breaking = bool(bang) or "BREAKING CHANGE" in subject
            commits.append(Commit(sha=sha, type=ctype, subject=msg, breaking=breaking))
        else:
            commits.append(Commit(sha=sha, type="other", subject=subject, breaking=False))
    return commits


def _group(commits: list[Commit]) -> dict[str, list[Commit]]:
    out: dict[str, list[Commit]] = defaultdict(list)
    for c in commits:
        if c.breaking:
            out["BREAKING"].append(c)
        section = CONV_TYPES.get(c.type, "Other")
        out[section].append(c)
    return out


def _build_stanza(version: str, groups: dict[str, list[Commit]]) -> str:
    from datetime import date

    sections_order = [
        "BREAKING CHANGES", "Added", "Changed", "Fixed", "Performance",
        "Docs", "Refactor", "Tests", "Build", "CI", "Other",
    ]
    lines = [f"## [{version}] — {date.today().isoformat()}", ""]
    for section in sections_order:
        items = groups.get(section, [])
        if not items:
            continue
        lines.append(f"### {section}")
        lines.append("")
        for c in items:
            lines.append(f"- {c.subject} ({c.sha})")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _open_editor(text: str) -> str:
    import os

    editor = os.environ.get("EDITOR") or os.environ.get("VISUAL")
    if not editor:
        print("\n--- Draft CHANGELOG stanza (no $EDITOR; not opening) ---\n")
        print(text)
        return text
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
        f.write(text)
        path = f.name
    subprocess.call([editor, path])
    return Path(path).read_text(encoding="utf-8")


def _write_version(version: str) -> None:
    # pyproject.toml
    pp = PYPROJECT.read_text(encoding="utf-8")
    pp = re.sub(r'^version\s*=\s*"[^"]+"', f'version = "{version}"', pp, count=1, flags=re.MULTILINE)
    PYPROJECT.write_text(pp, encoding="utf-8")

    # bumblebee/__init__.py
    if INIT_PY.exists():
        init = INIT_PY.read_text(encoding="utf-8")
        init = re.sub(r'__version__\s*=\s*"[^"]+"', f'__version__ = "{version}"', init, count=1)
        INIT_PY.write_text(init, encoding="utf-8")

    # web/package.json
    if WEB_PKG.exists():
        pkg = WEB_PKG.read_text(encoding="utf-8")
        pkg = re.sub(r'"version"\s*:\s*"[^"]+"', f'"version": "{version}"', pkg, count=1)
        WEB_PKG.write_text(pkg, encoding="utf-8")


def _prepend_changelog(stanza: str) -> None:
    existing = CHANGELOG.read_text(encoding="utf-8")
    # Insert after the first "## [Unreleased]" if present, else after the header.
    header_end = existing.find("\n", existing.find("# Changelog"))
    new_content = (
        existing[: header_end + 1]
        + "\n"
        + stanza
        + "\n"
        + existing[header_end + 1 :]
    )
    CHANGELOG.write_text(new_content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=["major", "minor", "patch"])
    parser.add_argument("--dry-run", action="store_true", help="Print plan, don't write")
    parser.add_argument("--yes", action="store_true", help="Skip editor + final confirm")
    args = parser.parse_args()

    current = _current_version()
    new = _bump(current, args.kind)
    print(f"\nBumping {current} → {new} ({args.kind})\n")

    tag = _last_tag()
    print(f"Last tag: {tag or '(none — full history)'}")
    commits = _commits_since(tag)
    print(f"Commits since: {len(commits)}\n")
    if not commits:
        sys.exit("no commits since last tag; nothing to release")

    groups = _group(commits)
    stanza = _build_stanza(new, groups)
    if not args.yes:
        stanza = _open_editor(stanza)

    if args.dry_run:
        print("\n--- DRY RUN ---\n")
        print(stanza)
        print(f"\nWould write {len(stanza)} chars to CHANGELOG.md")
        print(f"Would bump version files to {new}")
        print(f"Would git tag v{new} and push")
        return 0

    _write_version(new)
    _prepend_changelog(stanza)
    _run("git", "add", "pyproject.toml", "CHANGELOG.md", capture=False)
    if INIT_PY.exists():
        _run("git", "add", str(INIT_PY.relative_to(ROOT)), capture=False)
    if WEB_PKG.exists():
        _run("git", "add", str(WEB_PKG.relative_to(ROOT)), capture=False)
    _run("git", "commit", "-m", f"chore(release): v{new}", capture=False)
    _run("git", "tag", f"v{new}", capture=False)
    print(f"\nTagged v{new}. Push with: git push && git push --tags")
    print(f"Then create the GitHub release: gh release create v{new} --notes-from-tag")
    return 0


if __name__ == "__main__":
    sys.exit(main())
