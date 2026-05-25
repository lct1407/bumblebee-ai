"""Tool handlers for code operations — read/write files, search, git."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession
from bumblebee.services.tool.result import ToolResult


def _resolve(session: AgentSession, rel_path: str) -> Path | None:
    """Resolve path within workspace; reject escape via ../"""
    if not session.workspace_path:
        return None
    base = Path(session.workspace_path).resolve()
    target = (base / rel_path).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        return None  # escaped
    return target


async def read_file(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    rel = args["path"]
    p = _resolve(session, rel) if session.workspace_path else Path(rel)
    if p is None or not p.exists():
        return ToolResult.err(f"not_found: {rel}")
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return ToolResult.err(f"read_failed: {e}")
    return ToolResult.ok(
        f"read {len(content)} chars from {rel}",
        artifacts=[str(p)],
        data={"content": content[:5000]},  # cap for context budget
    )


async def write_file(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    rel = args["path"]
    content = args["content"]
    p = _resolve(session, rel) if session.workspace_path else Path(rel)
    if p is None:
        return ToolResult.err(f"path_outside_workspace: {rel}")
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
    except Exception as e:
        return ToolResult.err(f"write_failed: {e}")
    return ToolResult.ok(f"wrote {len(content)} chars to {rel}", artifacts=[str(p)])


async def search_code(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    pattern = args["pattern"]
    base = Path(session.workspace_path) if session.workspace_path else Path.cwd()
    matches: list[str] = []
    try:
        rx = re.compile(pattern)
    except re.error as e:
        return ToolResult.err(f"invalid_pattern: {e}")
    for p in base.rglob("*"):
        if not p.is_file() or any(part.startswith(".") for part in p.parts):
            continue
        try:
            for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if rx.search(line):
                    matches.append(f"{p.relative_to(base)}:{i}: {line.strip()[:200]}")
                    if len(matches) >= 50:
                        break
        except Exception:
            continue
        if len(matches) >= 50:
            break
    return ToolResult.ok(
        f"{len(matches)} matches",
        artifacts=matches[:20],
        data={"matches": matches},
    )


async def git_commit(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    if not session.workspace_path:
        return ToolResult.err("no_workspace")
    message = args["message"]
    cwd = session.workspace_path
    try:
        subprocess.check_call(["git", "add", "-A"], cwd=cwd)
        subprocess.check_output(
            ["git", "-c", "user.email=bot@bumblebee", "-c", "user.name=bumblebee",
             "commit", "-m", message],
            cwd=cwd,
            stderr=subprocess.STDOUT,
        )
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=cwd).decode().strip()
    except subprocess.CalledProcessError as e:
        return ToolResult.err(f"git_commit_failed: {e.output.decode()[:300]}")
    return ToolResult.ok(f"committed {sha[:7]}: {message[:60]}", artifacts=[sha])


async def git_diff(args: dict, session: AgentSession, db: AsyncSession) -> ToolResult:
    if not session.workspace_path:
        return ToolResult.err("no_workspace")
    cwd = session.workspace_path
    try:
        out = subprocess.check_output(["git", "diff", "--stat"], cwd=cwd).decode()
        full = subprocess.check_output(["git", "diff"], cwd=cwd).decode()
    except subprocess.CalledProcessError as e:
        return ToolResult.err(f"git_diff_failed: {e}")
    return ToolResult.ok(
        f"diff stat: {out.strip()[:200]}",
        data={"stat": out, "diff": full[:5000]},
    )


def register(executor) -> None:
    executor.register("read_file", read_file)
    executor.register("write_file", write_file)
    executor.register("search_code", search_code)
    executor.register("git_commit", git_commit)
    executor.register("git_diff", git_diff)
