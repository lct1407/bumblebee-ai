"""Worker daemon — Phase G2.

Connects to server with node_token, long-polls /api/tasks/claim, executes via
local Claude CLI (or shell), streams events back, then acks / fails.

Config (~/.bumblebee/node.json):
  { "server_url": "...", "node_id": "...", "node_token": "nt_...", "status": "active" }
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

import httpx

log = logging.getLogger("bumblebee.daemon")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


HEARTBEAT_INTERVAL_S = 30
DEFAULT_CAPS = ["claude-cli", "git"]


async def _heartbeat_loop(client: httpx.AsyncClient, server_url: str, token: str) -> None:
    """BB-17: heartbeat sends capabilities + repos manifest."""
    while True:
        try:
            r = await client.post(
                f"{server_url}/api/devices/heartbeat",
                json={
                    "capabilities": _detect_capabilities(),
                    "repos_discovered": _discover_repos(),
                },
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
            r.raise_for_status()
        except Exception as e:
            log.warning("heartbeat failed: %s", e)
        await asyncio.sleep(HEARTBEAT_INTERVAL_S)


def _discover_repos(search_roots: list[str] | None = None, max_depth: int = 3) -> list[dict]:
    """Scan filesystem for git repos. Returns [{path, remote, branch}, ...].

    BB-17: by default scans BB_WORKER_REPOS env (colon-separated) or ~/code, ~/src,
    ~/Source. Limits depth to avoid expensive walks.
    """
    import os
    from pathlib import Path
    roots = search_roots or os.environ.get("BB_WORKER_REPOS", "").split(":") or []
    roots = [r for r in roots if r] or [
        str(Path.home() / "code"),
        str(Path.home() / "src"),
        str(Path.home() / "Source"),
    ]
    found: list[dict] = []
    seen: set[str] = set()
    for root in roots:
        root_p = Path(root)
        if not root_p.exists():
            continue
        # iterate top-N levels looking for .git
        for git_dir in list(root_p.rglob(".git"))[:50]:
            repo = git_dir.parent
            abs_path = str(repo.resolve())
            if abs_path in seen:
                continue
            seen.add(abs_path)
            if abs_path.count(os.sep) - root_p.absolute().as_posix().count("/") > max_depth:
                continue
            remote = ""
            branch = ""
            try:
                import subprocess
                remote = subprocess.run(
                    ["git", "-C", abs_path, "remote", "get-url", "origin"],
                    capture_output=True, text=True, timeout=3,
                ).stdout.strip()
                branch = subprocess.run(
                    ["git", "-C", abs_path, "branch", "--show-current"],
                    capture_output=True, text=True, timeout=3,
                ).stdout.strip()
            except Exception:
                pass
            found.append({"path": abs_path, "remote": remote, "branch": branch})
    return found


def _detect_capabilities() -> list[str]:
    caps = list(DEFAULT_CAPS)
    if not shutil.which("claude"):
        caps.remove("claude-cli")
    if not shutil.which("git"):
        caps.remove("git")
    if shutil.which("docker"):
        caps.append("docker")
    return caps


async def _execute_task(
    client: httpx.AsyncClient,
    server_url: str,
    token: str,
    task: dict,
) -> bool:
    """Execute one claimed task. Returns True on success.

    Task kinds (set via payload.command_kind):
      - shell:           run payload.command in shell (legacy / generic)
      - role_exec:       BB-6 — spawn `claude --print` with role prompt + scope
                         context, parse JSON, apply via git apply / save events
      - merge_to_staging: shell git merge sequence (used by staging_flow)
      - e2e_smoke:       shell npm/pytest run
    """
    task_id = task["task_id"]
    payload = task.get("payload") or {}
    issue_id = task.get("issue_id")
    kind = payload.get("command_kind", "shell")
    log.info("executing task %s kind=%s (issue=%s)", task_id, kind, issue_id)

    async def report(event_type: str, body: dict) -> None:
        try:
            await client.post(
                f"{server_url}/api/tasks/{task_id}/report",
                json={"type": event_type, "payload": body, "issue_id": issue_id},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
        except Exception as e:
            log.warning("report failed: %s", e)

    await report("task_started", {"node_hostname": socket.gethostname(), "kind": kind})

    # BB-6: dispatch by kind
    if kind == "role_exec":
        ok = await _execute_role_exec(report, payload)
        await _ack(client, server_url, token, task_id, success=ok,
                   reason="role_exec" if ok else "role_exec_failed")
        return ok

    # Minimum-viable executor: run a shell command if provided
    cmd = payload.get("command")
    repo_path = payload.get("repo_path")
    cwd = repo_path if repo_path and Path(repo_path).exists() else os.getcwd()

    if not cmd:
        await report("task_no_command", {"reason": "payload missing 'command'"})
        await _ack(client, server_url, token, task_id, success=False, reason="no_command")
        return False

    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        # stream stdout line-by-line
        assert proc.stdout is not None
        async for raw in proc.stdout:
            line = raw.decode("utf-8", errors="replace").rstrip()
            await report("task_log", {"line": line})
        rc = await proc.wait()
        ok = rc == 0
        await report(
            "task_completed" if ok else "task_failed",
            {"return_code": rc},
        )
        await _ack(client, server_url, token, task_id, success=ok, reason=f"rc={rc}")
        return ok
    except Exception as e:
        await report("task_exception", {"error": str(e)[:500]})
        await _ack(client, server_url, token, task_id, success=False, reason=str(e)[:200])
        return False


async def _execute_role_exec(report, payload: dict) -> bool:
    """BB-6: spawn `claude --print` with role prompt + scope context.

    Expected payload:
      {
        "command_kind": "role_exec",
        "role": "implementer" | "tester" | ...,
        "system_prompt": "...",        # from server-side prompt loader
        "user_message": "...",         # issue + scope context
        "repo_path": "/path/to/repo",  # local checkout
        "apply_diff": true | false,    # try `git apply` on stdout if true
      }
    """
    import json
    role = payload.get("role", "implementer")
    repo_path = payload.get("repo_path")
    if not repo_path or not Path(repo_path).exists():
        await report("role_exec_skip", {"reason": f"repo_path not found: {repo_path}"})
        return False

    system = payload.get("system_prompt", "")
    user_msg = payload.get("user_message", "")
    if not user_msg:
        await report("role_exec_skip", {"reason": "no user_message"})
        return False

    if not shutil.which("claude"):
        await report("role_exec_skip", {"reason": "claude CLI not found in PATH"})
        return False

    await report("role_exec_started", {"role": role, "cwd": repo_path})

    # Compose prompt; for now feed via stdin
    full_prompt = f"<system>{system}</system>\n\n{user_msg}" if system else user_msg
    try:
        proc = await asyncio.create_subprocess_exec(
            "claude", "--print", "--output-format=json",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=repo_path,
        )
        stdout, stderr = await proc.communicate(input=full_prompt.encode("utf-8"))
        if proc.returncode != 0:
            await report("role_exec_failed", {
                "rc": proc.returncode,
                "stderr": stderr.decode("utf-8", errors="replace")[:1000],
            })
            return False
        out_text = stdout.decode("utf-8", errors="replace")
        try:
            parsed = json.loads(out_text)
            result_text = parsed.get("result") or parsed.get("text") or out_text
        except Exception:
            result_text = out_text
        await report("role_exec_output", {"text": result_text[:4000], "size": len(result_text)})

        # BB-6: try to apply diff if Implementer role + payload.apply_diff
        if payload.get("apply_diff") and role == "implementer":
            diff_text = _extract_diff(result_text)
            if diff_text:
                applied = await _apply_diff(repo_path, diff_text, report)
                await report("git_apply_result", {"applied": applied})
        await report("role_exec_completed", {"role": role})
        return True
    except Exception as e:
        await report("role_exec_exception", {"error": str(e)[:500]})
        return False


def _extract_diff(text: str) -> str | None:
    """Pull a unified diff out of a markdown ```diff fenced block."""
    import re
    m = re.search(r"```(?:diff|patch)?\n(diff --git.*?)\n```", text, re.DOTALL)
    if m:
        return m.group(1)
    # raw diff fallback (starts with 'diff --git')
    if "diff --git" in text:
        return text[text.index("diff --git"):]
    return None


async def _apply_diff(repo_path: str, diff: str, report) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "apply", "--whitespace=nowarn", "-",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE, cwd=repo_path,
        )
        _, stderr = await proc.communicate(input=diff.encode("utf-8"))
        if proc.returncode != 0:
            await report("git_apply_failed", {"stderr": stderr.decode("utf-8")[:500]})
            return False
        return True
    except Exception as e:
        await report("git_apply_exception", {"error": str(e)[:300]})
        return False


async def _ack(
    client: httpx.AsyncClient, server_url: str, token: str,
    task_id: str, *, success: bool, reason: str = "",
) -> None:
    endpoint = "ack" if success else "fail"
    try:
        params = {"reason": reason} if not success else {}
        await client.post(
            f"{server_url}/api/tasks/{task_id}/{endpoint}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except Exception as e:
        log.warning("ack/fail failed: %s", e)


async def run_daemon(server_url: str, config_path: Path, poll_interval: float) -> int:
    if not config_path.exists():
        log.error("no config at %s — run `bb device pair` first", config_path)
        return 2
    cfg = json.loads(config_path.read_text())
    token = cfg.get("node_token")
    if not token or not token.startswith("nt_"):
        log.error("config missing valid node_token (status=%s)", cfg.get("status"))
        return 2

    log.info("daemon starting → server=%s node=%s", server_url, cfg.get("node_id"))
    async with httpx.AsyncClient() as client:
        hb_task = asyncio.create_task(_heartbeat_loop(client, server_url, token))
        try:
            while True:
                try:
                    r = await client.post(
                        f"{server_url}/api/tasks/claim",
                        json={"capabilities": _detect_capabilities()},
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=30,
                    )
                    r.raise_for_status()
                    task = r.json()
                    if task is None:
                        await asyncio.sleep(poll_interval)
                        continue
                    await _execute_task(client, server_url, token, task)
                except KeyboardInterrupt:
                    log.info("interrupted, shutting down")
                    return 0
                except Exception as e:
                    log.error("poll error: %s", e)
                    await asyncio.sleep(poll_interval * 2)
        finally:
            hb_task.cancel()
    return 0


if __name__ == "__main__":
    cfg = Path(os.environ.get("BB_NODE_CONFIG", "~/.bumblebee/node.json")).expanduser()
    server = os.environ.get("BB_SERVER_URL", "http://localhost:8000")
    sys.exit(asyncio.run(run_daemon(server, cfg, 3.0)))
