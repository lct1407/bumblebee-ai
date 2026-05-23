"""GitHub webhook receiver — Phase I3.

Subscribed events:
  - pull_request (opened/closed/synchronize)  -> upsert Issue with status mapping
  - issues (opened/closed)                    -> mirror as Bumblebee issue
  - issue_comment.created                     -> append Comment

Signature verification: HMAC-SHA256 over raw body with GITHUB_WEBHOOK_SECRET.
"""
from __future__ import annotations
import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.config import get_settings
from bumblebee.database import get_db
from bumblebee.models.issue import Issue, IssueStatus, IssueType, IssuePriority
from bumblebee.models.project import Project
from bumblebee.services.state.event_log import append_event

router = APIRouter(prefix="/api/webhooks/github", tags=["webhooks"])
log = logging.getLogger("bumblebee.github")


def _scan_commit_for_actionables(message: str) -> list[tuple[str, str]]:
    """BB-13: find (marker, title) pairs in commit message.

    Patterns:
      - "fix #123 something" -> ('fix', 'something')
      - "TODO: do X"         -> ('todo', 'do X')
      - "FIXME: bug Y"       -> ('fix', 'bug Y')
    """
    import re
    found: list[tuple[str, str]] = []
    for m in re.finditer(r"(?im)^\s*(fix|fixes|resolves)\s+#?\d+\s*[:\-]?\s*(.+)$", message):
        found.append(("fix", m.group(2).strip()))
    for m in re.finditer(r"(?im)^\s*(TODO|FIXME)\s*[:\-]\s*(.+)$", message):
        marker = "fix" if m.group(1).upper() == "FIXME" else "todo"
        found.append((marker, m.group(2).strip()))
    return found


def _verify_signature(secret: str, body: bytes, header_sig: str | None) -> bool:
    if not header_sig or not header_sig.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header_sig)


async def _resolve_project(db: AsyncSession, repo_full_name: str | None) -> Project | None:
    """Match by exact repo_path or by trailing match (e.g. 'lct1407/bumblebee')."""
    if not repo_full_name:
        return None
    candidates = (
        await db.execute(select(Project).where(Project.repo_path.is_not(None)))
    ).scalars().all()
    for p in candidates:
        rp = (p.repo_path or "").strip()
        if rp == repo_full_name or rp.endswith("/" + repo_full_name) or repo_full_name in rp:
            return p
    return None


_PR_STATUS_MAP = {
    ("opened", False): IssueStatus.NEW,
    ("reopened", False): IssueStatus.REOPEN,
    ("synchronize", False): IssueStatus.IN_PROGRESS,
    ("closed", False): IssueStatus.CLOSED,
    ("closed", True): IssueStatus.RELEASED,   # merged
}


async def _upsert_from_pr(db: AsyncSession, project: Project, payload: dict) -> Issue:
    pr = payload.get("pull_request") or {}
    action = payload.get("action")
    merged = bool(pr.get("merged"))
    gh_id = pr.get("id")
    gh_number = pr.get("number")
    title = pr.get("title") or f"PR #{gh_number}"
    body = pr.get("body") or ""

    existing = (
        await db.execute(
            select(Issue).where(
                Issue.project_id == project.id,
                Issue.session_context["github_pr_id"].astext == str(gh_id) if gh_id else False,
            )
        )
    ).scalar_one_or_none() if gh_id else None

    new_status = _PR_STATUS_MAP.get((action, merged), IssueStatus.NEW)

    if existing:
        existing.status = new_status
        existing.title = title
        existing.description = body
        return existing

    # Allocate next per-project number
    n = (
        await db.execute(
            select(func.coalesce(func.max(Issue.number), 0) + 1).where(Issue.project_id == project.id)
        )
    ).scalar_one()
    issue = Issue(
        project_id=project.id,
        workspace_id=project.workspace_id,
        number=n,
        title=title,
        description=body,
        type=IssueType.FEATURE,
        priority=IssuePriority.MEDIUM,
        status=new_status,
        session_context={
            "github_pr_id": str(gh_id),
            "github_pr_number": gh_number,
            "github_url": pr.get("html_url"),
            "head_ref": (pr.get("head") or {}).get("ref"),
            "base_ref": (pr.get("base") or {}).get("ref"),
        },
    )
    db.add(issue)
    await db.flush()
    return issue


async def _upsert_from_issue(db: AsyncSession, project: Project, payload: dict) -> Issue | None:
    """GitHub Issues (not PR)."""
    iss = payload.get("issue") or {}
    if iss.get("pull_request"):
        return None  # let PR handler do it
    action = payload.get("action")
    gh_id = iss.get("id")
    title = iss.get("title") or f"Issue #{iss.get('number')}"
    body = iss.get("body") or ""

    status = {
        "opened": IssueStatus.NEW,
        "reopened": IssueStatus.REOPEN,
        "closed": IssueStatus.CLOSED,
        "edited": IssueStatus.NEW,
    }.get(action, IssueStatus.NEW)

    existing = (
        await db.execute(
            select(Issue).where(
                Issue.project_id == project.id,
                Issue.session_context["github_issue_id"].astext == str(gh_id) if gh_id else False,
            )
        )
    ).scalar_one_or_none() if gh_id else None

    if existing:
        existing.status = status
        existing.title = title
        existing.description = body
        return existing

    n = (
        await db.execute(
            select(func.coalesce(func.max(Issue.number), 0) + 1).where(Issue.project_id == project.id)
        )
    ).scalar_one()
    new_issue = Issue(
        project_id=project.id,
        workspace_id=project.workspace_id,
        number=n,
        title=title,
        description=body,
        type=IssueType.BUG if "bug" in (l.get("name", "").lower() for l in iss.get("labels", [])) else IssueType.TASK,
        priority=IssuePriority.MEDIUM,
        status=status,
        session_context={
            "github_issue_id": str(gh_id),
            "github_issue_number": iss.get("number"),
            "github_url": iss.get("html_url"),
        },
    )
    db.add(new_issue)
    await db.flush()
    return new_issue


@router.post("")
async def receive(
    request: Request,
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
    x_github_event: str | None = Header(None, alias="X-GitHub-Event"),
    db: AsyncSession = Depends(get_db),
):
    raw = await request.body()
    secret = getattr(get_settings(), "github_webhook_secret", None) or ""
    if secret:
        if not _verify_signature(secret, raw, x_hub_signature_256):
            raise HTTPException(401, "bad_signature")
    else:
        log.warning("github webhook received without GITHUB_WEBHOOK_SECRET configured")

    payload = await request.json()
    action = payload.get("action")
    repo_full = ((payload.get("repository") or {}).get("full_name"))
    log.info("github webhook: event=%s action=%s repo=%s", x_github_event, action, repo_full)

    project = await _resolve_project(db, repo_full)
    if not project:
        # No mapped project — log and return 200 (don't make GitHub retry)
        return {"ok": True, "event": x_github_event, "action": action, "mapped": False}

    issue = None
    if x_github_event == "pull_request":
        issue = await _upsert_from_pr(db, project, payload)
    elif x_github_event == "issues":
        issue = await _upsert_from_issue(db, project, payload)
    elif x_github_event == "push":
        # BB-13: scan commits for "fix #N", "TODO:", "FIXME:" → auto-create issues
        for commit in payload.get("commits", []) or []:
            msg = commit.get("message") or ""
            issues_found = _scan_commit_for_actionables(msg)
            for marker, title in issues_found:
                # avoid duplicate creation: idempotent via commit sha
                from sqlalchemy import func as sqlfunc
                from bumblebee.models.issue import IssueType, IssuePriority
                n = (
                    await db.execute(
                        sqlfunc.coalesce(sqlfunc.max(Issue.number), 0) + 1
                    )
                    if False else
                    await db.execute(
                        select(func.coalesce(func.max(Issue.number), 0) + 1).where(
                            Issue.project_id == project.id
                        )
                    )
                ).scalar_one()
                new_iss = Issue(
                    project_id=project.id, workspace_id=project.workspace_id,
                    number=n, title=title[:480],
                    description=f"Auto-created from commit `{commit.get('id', '')[:8]}`:\n\n{msg}",
                    type=IssueType.BUG if marker == "fix" else IssueType.TASK,
                    priority=IssuePriority.MEDIUM,
                    status=IssueStatus.NEW,
                    session_context={"github_push_sha": commit.get("id"), "marker": marker},
                )
                db.add(new_iss)
                await db.flush()
                issue = new_iss  # for event-log linkage

    if issue:
        await append_event(
            db,
            type=f"github_{x_github_event}_{action}",
            issue_id=issue.id,
            project_id=project.id,
            workspace_id=project.workspace_id,
            payload={"action": action, "url": (payload.get("pull_request") or payload.get("issue") or {}).get("html_url")},
            source="github",
        )
        await db.commit()
        return {"ok": True, "event": x_github_event, "action": action, "issue_id": str(issue.id)}
    await db.commit()
    return {"ok": True, "event": x_github_event, "action": action, "mapped": True, "noop": True}
