"""Changelog endpoint — exposes CHANGELOG.md as JSON for the web UI 'What's new' modal.

Parses the standard Keep-a-Changelog format. Cached because CHANGELOG.md
changes only on release.
"""
from __future__ import annotations
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/changelog", tags=["changelog"])

# Resolve relative to repo root (3 levels up from bumblebee/routers/changelog.py)
CHANGELOG_PATH = Path(__file__).parent.parent.parent / "CHANGELOG.md"

# `## [version]` or `## version`, optionally followed by — / - / – + ISO date.
# Use lookahead `(?!#)` to reject `###` headings (else `###` would match too).
HEADING_RE = re.compile(
    r"^##(?!#)\s*(?:\[([^\]]+)\]|(\S+))\s*(?:—|-|–)?\s*(\d{4}-\d{2}-\d{2})?",
    re.MULTILINE,
)
# Sections are `### Foo` — anchor that they're NOT `####`
SECTION_RE = re.compile(r"^###(?!#)\s+(.+)$", re.MULTILINE)


def _parse_changelog(text: str) -> list[dict]:
    """Split the changelog into version stanzas with section breakdown."""
    out: list[dict] = []
    # Find all version headings and their byte positions
    matches = list(HEADING_RE.finditer(text))
    for idx, m in enumerate(matches):
        # Either bracketed [version] or bare version
        version = (m.group(1) or m.group(2) or "").strip()
        date = m.group(3)
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        body = text[start:end].strip()

        # Split into sections (### Added, ### Fixed, etc.)
        sections: dict[str, list[str]] = {}
        section_matches = list(SECTION_RE.finditer(body))
        if section_matches:
            for i, sm in enumerate(section_matches):
                name = sm.group(1).strip()
                s_start = sm.end()
                s_end = section_matches[i + 1].start() if i + 1 < len(section_matches) else len(body)
                bullets = [
                    line.lstrip("- ").strip()
                    for line in body[s_start:s_end].splitlines()
                    if line.strip().startswith("-")
                ]
                sections[name] = bullets
        else:
            # No sub-sections — keep the whole body as 'notes'
            sections["Notes"] = [body]

        out.append({
            "version": version,
            "date": date,
            "sections": sections,
        })
    return out


@lru_cache(maxsize=1)
def _cached_load() -> list[dict]:
    if not CHANGELOG_PATH.exists():
        return []
    return _parse_changelog(CHANGELOG_PATH.read_text(encoding="utf-8"))


@router.get("")
async def get_changelog(limit: int = Query(5, ge=1, le=50)):
    """Return the most recent N releases parsed into JSON."""
    releases = _cached_load()
    return {
        "releases": releases[:limit],
        "total": len(releases),
    }


@router.get("/latest")
async def get_latest_release():
    """Return only the most recent release stanza (for 'What's new' modal)."""
    releases = _cached_load()
    if not releases:
        raise HTTPException(404, "changelog empty or unavailable")
    return releases[0]


@router.post("/reload", status_code=200)
async def reload_changelog():
    """Drop the cache + re-read CHANGELOG.md. Useful after a release deploy."""
    _cached_load.cache_clear()
    return {"reloaded": True, "releases": len(_cached_load())}
