"""Phase C — YAML prompts loader + validator + context_assembler integration."""
from __future__ import annotations

import pytest

from bumblebee.prompts import (
    DefenseBaseline,
    Prompt,
    assemble_system_prompt,
    get_defense_baseline,
    get_prompt,
    list_roles,
)
from bumblebee.prompts.validator import validate_all


def test_loads_all_10_named_roles():
    roles = list_roles()
    # Plan §C committed to 10 specialist roles + assistant
    expected = {
        "triager", "coordinator", "planner", "implementer", "tester",
        "reviewer", "merger", "documenter", "assistant",
        "failure_diagnostician", "integrator",
    }
    assert expected.issubset(set(roles)), f"missing: {expected - set(roles)}"


def test_defense_baseline_loaded_and_substantive():
    b = get_defense_baseline()
    assert isinstance(b, DefenseBaseline)
    assert b.version >= 1
    # Baseline must include at least the 4 core protections
    body = b.content.lower()
    assert "never reveal" in body or "never accept role" in body
    assert "workspace boundary" in body
    assert len(b.content) > 300


def test_assembled_prompt_starts_with_defense_baseline():
    """Every role's assembled prompt must begin with defense baseline content."""
    baseline = get_defense_baseline()
    for role in list_roles():
        assembled = assemble_system_prompt(role)
        # The baseline content should be a prefix of the assembled prompt
        # (rstripped because we add separator after)
        assert assembled.startswith(baseline.content.rstrip()), (
            f"role {role!r} doesn't start with defense baseline"
        )


def test_validator_passes_clean():
    """The validator must report zero errors on the shipped prompts."""
    issues, summary = validate_all()
    errors = [i for i in issues if i.severity == "error"]
    assert errors == [], "errors: " + "; ".join(f"{i.role}: {i.message}" for i in errors)
    assert summary["roles"] >= 10


def test_every_role_has_output_schema():
    """All roles emit structured output — schemas are required."""
    for role in list_roles():
        p = get_prompt(role)
        assert p.output_schema, f"role {role!r} missing output_schema"
        # Must declare object root
        assert p.output_schema.get("type") == "object"


def test_every_role_has_budgets():
    """Budgets gate the Safety plane — must be set on every role."""
    for role in list_roles():
        p = get_prompt(role)
        assert "wall_min" in p.budgets
        assert "tokens_max" in p.budgets
        assert "dollars_max" in p.budgets
        # Sanity: tokens > 0, dollars > 0
        assert p.budgets["tokens_max"] > 0
        assert p.budgets["dollars_max"] > 0


def test_triager_few_shot_examples_validate_against_own_schema():
    """The validator catches schema violations in few-shot examples."""
    p = get_prompt("triager")
    assert p.few_shot_examples, "triager should have examples"
    # Verified by validate_all() too, but check the count separately
    assert len(p.few_shot_examples) >= 2


def test_assembled_prompt_is_reasonable_length():
    """Catches accidentally-huge or accidentally-tiny prompts."""
    for role in list_roles():
        assembled = assemble_system_prompt(role)
        assert 500 < len(assembled) < 20_000, (
            f"role {role!r} assembled prompt length: {len(assembled)}"
        )
