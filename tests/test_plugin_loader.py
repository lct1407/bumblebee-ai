"""Plugin loader tests — Phase 3."""
import pytest
from sqlalchemy import select

from bumblebee.models.plugin_registration import PluginRegistration
from bumblebee.models.workflow import Workflow
from bumblebee.models.agent_definition import AgentDefinition
from bumblebee.models.skill import Skill
from bumblebee.services.plugins.loader import PluginLoader


@pytest.mark.asyncio
async def test_loader_discovers_reference_plugin(clean_db):
    db = clean_db
    loader = PluginLoader()
    results = await loader.discover_and_register(db)
    names = [r.name for r in results]
    # Reference plugin must be discovered (assumes pip install -e bumblebee-plugin-example/)
    assert "example" in names, f"reference plugin missing; found: {names}"
    example = next(r for r in results if r.name == "example")
    assert example.status == "loaded"
    assert example.workflows_registered >= 1
    assert example.agent_defs_registered >= 1
    assert example.skills_registered >= 1


@pytest.mark.asyncio
async def test_loader_writes_plugin_registration(clean_db):
    db = clean_db
    loader = PluginLoader()
    await loader.discover_and_register(db)
    reg = (
        await db.execute(
            select(PluginRegistration).where(PluginRegistration.name == "example")
        )
    ).scalar_one_or_none()
    assert reg is not None
    assert reg.status == "loaded"
    assert reg.version == "0.1.0"


@pytest.mark.asyncio
async def test_plugin_workflow_tagged_source_plugin(clean_db):
    db = clean_db
    loader = PluginLoader()
    await loader.discover_and_register(db)
    wf = (
        await db.execute(
            select(Workflow).where(Workflow.name == "example-hello-flow")
        )
    ).scalar_one_or_none()
    assert wf is not None
    assert wf.source_plugin == "example"


@pytest.mark.asyncio
async def test_plugin_agent_def_tagged(clean_db):
    db = clean_db
    loader = PluginLoader()
    await loader.discover_and_register(db)
    ad = (
        await db.execute(
            select(AgentDefinition).where(AgentDefinition.role == "greeter")
        )
    ).scalar_one_or_none()
    assert ad is not None
    assert ad.source_plugin == "example"
    assert "Greeter" in ad.prompt_template or "greeter" in ad.prompt_template.lower()


@pytest.mark.asyncio
async def test_loader_idempotent_on_rerun(clean_db):
    """Re-running discover doesn't duplicate."""
    db = clean_db
    loader = PluginLoader()
    await loader.discover_and_register(db)
    count1 = len((await db.execute(select(Workflow).where(Workflow.source_plugin == "example"))).scalars().all())
    await loader.discover_and_register(db)
    count2 = len((await db.execute(select(Workflow).where(Workflow.source_plugin == "example"))).scalars().all())
    assert count1 == count2


def test_module_purity_no_hardcoded_workflow_names():
    """Audit: services/control/ must NOT hardcode workflow names like 'simple-fix-flow'."""
    from pathlib import Path
    control_dir = Path(__file__).parent.parent / "bumblebee" / "services" / "control"
    bad_patterns = ["simple-fix-flow", "feature-complex-flow", "chat-assistant-flow"]
    violations = []
    for py in control_dir.rglob("*.py"):
        text = py.read_text(encoding="utf-8")
        for p in bad_patterns:
            if p in text:
                violations.append(f"{py.relative_to(control_dir)}: contains '{p}'")
    assert not violations, "Hardcoded workflow names in control plane: " + "; ".join(violations)
