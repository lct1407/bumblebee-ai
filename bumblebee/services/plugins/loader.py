"""PluginLoader — Phase 3 entry_points discovery + failure isolation.

Plugin convention:
    [project.entry-points."bumblebee.plugins"]
    myname = "bumblebee_plugin_myname:manifest"

Plugin manifest = dict with: name, version, workflows (paths), agent_defs, skills, tools.
"""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib.metadata import entry_points
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_definition import AgentDefinition
from bumblebee.models.plugin_registration import PluginRegistration
from bumblebee.models.skill import Skill
from bumblebee.models.workflow import Workflow


ENTRY_POINT_GROUP = "bumblebee.plugins"


@dataclass
class PluginLoadResult:
    name: str
    status: str  # "loaded" | "failed" | "skipped"
    workflows_registered: int = 0
    agent_defs_registered: int = 0
    skills_registered: int = 0
    error: str | None = None


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _hash_dict(d: dict) -> str:
    return hashlib.sha256(json.dumps(d, sort_keys=True).encode()).hexdigest()


def _parse_frontmatter_md(text: str) -> tuple[dict, str]:
    """Parse YAML frontmatter + body from a Markdown file (used by agent defs)."""
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end < 0:
        return {}, text
    front = yaml.safe_load(text[4:end])
    body = text[end + 4 :].lstrip("\n")
    return front or {}, body


class PluginLoader:
    """Discover external plugins via entry_points and register into DB."""

    async def discover_and_register(self, db: AsyncSession) -> list[PluginLoadResult]:
        results: list[PluginLoadResult] = []
        try:
            eps = entry_points(group=ENTRY_POINT_GROUP)
        except TypeError:
            eps = entry_points().get(ENTRY_POINT_GROUP, [])

        for ep in eps:
            try:
                manifest_obj = ep.load()
                manifest = (
                    manifest_obj() if callable(manifest_obj) else manifest_obj
                )
                if not isinstance(manifest, dict):
                    raise ValueError(f"manifest must be a dict, got {type(manifest)}")
                result = await self._register_manifest(db, ep, manifest)
                results.append(result)
            except Exception as e:
                err = f"{type(e).__name__}: {e}"
                await self._record_failure(db, ep.name, err)
                results.append(PluginLoadResult(name=ep.name, status="failed", error=err))
        await db.commit()
        return results

    async def _register_manifest(
        self, db: AsyncSession, ep: Any, manifest: dict
    ) -> PluginLoadResult:
        name = manifest.get("name") or ep.name
        version = manifest.get("version", "0.0.0")

        # Upsert PluginRegistration
        reg = (
            await db.execute(
                select(PluginRegistration).where(PluginRegistration.name == name)
            )
        ).scalar_one_or_none()
        if reg is None:
            reg = PluginRegistration(
                name=name,
                version=version,
                module=ep.value,
                status="loaded",
                manifest={"raw": str(manifest)[:1000]},
                loaded_at=datetime.now(timezone.utc),
            )
            db.add(reg)
        else:
            reg.version = version
            reg.module = ep.value
            reg.status = "loaded"
            reg.error_message = None
            reg.loaded_at = datetime.now(timezone.utc)
        await db.flush()

        wf_count = await self._register_workflows(db, name, manifest.get("workflows", []))
        ag_count = await self._register_agents(db, name, manifest.get("agent_defs", []))
        sk_count = await self._register_skills(db, name, manifest.get("skills", []))

        return PluginLoadResult(
            name=name,
            status="loaded",
            workflows_registered=wf_count,
            agent_defs_registered=ag_count,
            skills_registered=sk_count,
        )

    async def _register_workflows(
        self, db: AsyncSession, plugin_name: str, paths: list
    ) -> int:
        count = 0
        for p in paths:
            try:
                path = Path(p)
                if not path.exists():
                    continue
                text = path.read_text(encoding="utf-8")
                data = yaml.safe_load(text)
                wname = data["name"]
                wh = _hash_text(text)
                existing = (
                    await db.execute(
                        select(Workflow).where(Workflow.name == wname)
                    )
                ).scalar_one_or_none()
                if existing:
                    existing.graph = data
                    existing.graph_hash = wh
                    existing.source_plugin = plugin_name
                else:
                    wf = Workflow(
                        name=wname,
                        version=int(data.get("version", 1)),
                        graph=data,
                        graph_hash=wh,
                        description=data.get("description"),
                        is_active=True,
                        is_default=False,
                        source_plugin=plugin_name,
                    )
                    db.add(wf)
                count += 1
            except Exception:
                continue
        await db.flush()
        return count

    async def _register_agents(
        self, db: AsyncSession, plugin_name: str, paths: list
    ) -> int:
        count = 0
        for p in paths:
            try:
                path = Path(p)
                if not path.exists():
                    continue
                text = path.read_text(encoding="utf-8")
                front, body = _parse_frontmatter_md(text)
                role = front.get("name") or path.stem
                prompt_hash = _hash_text(body)
                existing = (
                    await db.execute(
                        select(AgentDefinition).where(AgentDefinition.role == role)
                    )
                ).scalar_one_or_none()
                if existing:
                    existing.prompt_template = body
                    existing.prompt_hash = prompt_hash
                    existing.source_plugin = plugin_name
                else:
                    ad = AgentDefinition(
                        name=front.get("name", role),
                        role=role,
                        description=front.get("description"),
                        prompt_template=body,
                        prompt_hash=prompt_hash,
                        default_tools=front.get("tools", []),
                        focus_areas=front.get("focus_areas", []),
                        default_budgets=front.get("budgets", {}),
                        is_global=True,
                        source_plugin=plugin_name,
                    )
                    db.add(ad)
                count += 1
            except Exception:
                continue
        await db.flush()
        return count

    async def _register_skills(
        self, db: AsyncSession, plugin_name: str, paths: list
    ) -> int:
        count = 0
        for p in paths:
            try:
                path = Path(p)
                if not path.exists():
                    continue
                text = path.read_text(encoding="utf-8")
                front, body = _parse_frontmatter_md(text)
                skill_name = front.get("name") or path.parent.name
                version = front.get("version", "1.0.0")
                existing = (
                    await db.execute(
                        select(Skill).where(Skill.name == skill_name)
                    )
                ).scalar_one_or_none()
                if existing:
                    existing.skill_md = body
                    existing.version = version
                else:
                    sk = Skill(
                        name=skill_name,
                        description=front.get("description", skill_name),
                        version=version,
                        skill_md=body,
                        files=[],
                        is_global=True,
                    )
                    sk.source_plugin = plugin_name
                    db.add(sk)
                count += 1
            except Exception:
                continue
        await db.flush()
        return count

    async def _record_failure(
        self, db: AsyncSession, name: str, error: str
    ) -> None:
        reg = (
            await db.execute(
                select(PluginRegistration).where(PluginRegistration.name == name)
            )
        ).scalar_one_or_none()
        if reg is None:
            reg = PluginRegistration(name=name, status="failed", error_message=error[:2000])
            db.add(reg)
        else:
            reg.status = "failed"
            reg.error_message = error[:2000]
        await db.flush()


_singleton: PluginLoader | None = None


def get_loader() -> PluginLoader:
    global _singleton
    if _singleton is None:
        _singleton = PluginLoader()
    return _singleton
