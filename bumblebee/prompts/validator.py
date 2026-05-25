"""Prompt YAML validator — runs in CI to gate prompt regressions.

Three validation passes:
  1. Structural — every YAML has required fields, output_schema parseable.
  2. Few-shot — each example.output is valid against the role's output_schema.
  3. Defense baseline coverage — every role's system prompt assembles cleanly.

For CI: `python -m bumblebee.prompts.validator` exits non-zero on any failure.
For dev: `bb eval prompts` (same code).

NO LLM CALLS in this validator — it's free + deterministic. The slower
LLM-backed scoring lives in bumblebee.eval.runner.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass

from jsonschema import Draft202012Validator, SchemaError

from bumblebee.prompts.loader import assemble_system_prompt, get_prompt, list_roles


@dataclass
class ValidationIssue:
    role: str
    severity: str  # error / warning
    message: str


def _validate_structure(role: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    try:
        p = get_prompt(role)
    except KeyError as e:
        return [ValidationIssue(role, "error", f"prompt missing: {e}")]

    if not p.system.strip():
        issues.append(ValidationIssue(role, "error", "empty system prompt"))
    if not p.output_schema:
        issues.append(ValidationIssue(role, "warning", "no output_schema declared"))
    if not p.tools_allowed:
        issues.append(ValidationIssue(role, "warning", "tools_allowed is empty"))
    if not p.budgets:
        issues.append(ValidationIssue(role, "warning", "budgets unset"))

    # Schema must be valid JSON Schema itself
    if p.output_schema:
        try:
            Draft202012Validator.check_schema(p.output_schema)
        except SchemaError as e:
            issues.append(ValidationIssue(role, "error", f"output_schema invalid: {e.message}"))
    return issues


def _validate_few_shots(role: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    p = get_prompt(role)
    if not p.few_shot_examples:
        return issues
    if not p.output_schema:
        # nothing to validate against
        return issues

    validator = Draft202012Validator(p.output_schema)
    for idx, example in enumerate(p.few_shot_examples):
        raw_output = example.get("output", "")
        if not raw_output:
            continue
        # Output is stored as a JSON string in the YAML for readability
        try:
            data = json.loads(raw_output)
        except json.JSONDecodeError as e:
            issues.append(ValidationIssue(
                role, "error",
                f"few-shot example #{idx} output is not valid JSON: {e}",
            ))
            continue
        errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
        for err in errors:
            path = ".".join(str(p) for p in err.absolute_path) or "(root)"
            issues.append(ValidationIssue(
                role, "error",
                f"few-shot example #{idx} schema violation @{path}: {err.message}",
            ))
    return issues


def _validate_assembled_prompt(role: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    try:
        assembled = assemble_system_prompt(role)
    except Exception as e:
        return [ValidationIssue(role, "error", f"failed to assemble prompt: {e}")]
    if len(assembled) < 200:
        issues.append(ValidationIssue(
            role, "warning",
            f"assembled prompt is suspiciously short ({len(assembled)} chars)",
        ))
    if len(assembled) > 12_000:
        issues.append(ValidationIssue(
            role, "warning",
            f"assembled prompt is very long ({len(assembled)} chars) — costly per call",
        ))
    return issues


def validate_all() -> tuple[list[ValidationIssue], dict]:
    """Run all 3 validation passes across all roles. Returns (issues, summary)."""
    issues: list[ValidationIssue] = []
    summary = {"roles": 0, "examples": 0, "errors": 0, "warnings": 0}

    for role in list_roles():
        summary["roles"] += 1
        issues.extend(_validate_structure(role))
        issues.extend(_validate_few_shots(role))
        issues.extend(_validate_assembled_prompt(role))
        try:
            summary["examples"] += len(get_prompt(role).few_shot_examples)
        except Exception:
            pass

    summary["errors"] = sum(1 for i in issues if i.severity == "error")
    summary["warnings"] = sum(1 for i in issues if i.severity == "warning")
    return issues, summary


def main() -> int:
    issues, summary = validate_all()

    print("\nBumblebee prompt validator")
    print(f"  roles scanned : {summary['roles']}")
    print(f"  few-shots     : {summary['examples']}")
    print(f"  errors        : {summary['errors']}")
    print(f"  warnings      : {summary['warnings']}")
    print()

    if issues:
        for i in issues:
            tag = "[err]" if i.severity == "error" else "[warn]"
            print(f"  {tag} {i.role}: {i.message}")
        print()

    if summary["errors"] > 0:
        print("FAILED")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
