"""Project repo path/URL validator — BB-15.

Accepts:
  - Absolute filesystem path (must exist + contain .git)
  - HTTPS git URL (github.com / gitlab.com / bitbucket.org / generic)
  - SSH git URL (git@host:owner/repo.git)
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass
class RepoValidation:
    ok: bool
    kind: str            # "local" | "https" | "ssh" | "invalid"
    reason: str = ""
    normalized: str = ""


HTTPS_RE = re.compile(r"^https?://([^/]+)/(.+?)(\.git)?/?$")
SSH_RE = re.compile(r"^(?:ssh://)?git@([^:/]+)[:/](.+?)(\.git)?$")


def validate_repo_path(path: str) -> RepoValidation:
    """Classify + validate a repo path/URL."""
    s = (path or "").strip()
    if not s:
        return RepoValidation(False, "invalid", "empty")

    # Local absolute path
    if s.startswith("/") or (len(s) >= 2 and s[1] == ":"):  # /home/... or C:\... or D:/...
        p = Path(s).expanduser()
        if not p.exists():
            return RepoValidation(False, "local", f"path does not exist: {s}")
        if not (p / ".git").exists():
            return RepoValidation(False, "local", f"not a git repo (no .git): {s}")
        return RepoValidation(True, "local", normalized=str(p.resolve()))

    # SSH
    m = SSH_RE.match(s)
    if m:
        host, repo = m.group(1), m.group(2)
        return RepoValidation(True, "ssh", normalized=f"git@{host}:{repo}.git")

    # HTTPS
    m = HTTPS_RE.match(s)
    if m:
        host, repo = m.group(1), m.group(2)
        return RepoValidation(True, "https", normalized=f"https://{host}/{repo}.git")

    # Bare owner/repo (e.g. lct1407/bumblebee) — assume github
    if re.match(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", s):
        return RepoValidation(True, "https", normalized=f"https://github.com/{s}.git")

    return RepoValidation(False, "invalid", f"unrecognised format: {s}")
