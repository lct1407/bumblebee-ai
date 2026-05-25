"""Bundle installer for external AI agents (Claude Code, Cursor, Codex, ...).

Exposes prompts + workflows + a slim CLAUDE.md so AI agents in user's repo
can read Bumblebee role definitions when assisting.
"""
from bumblebee.installer.bundler import TARGETS, install_bundle

__all__ = ["TARGETS", "install_bundle"]
