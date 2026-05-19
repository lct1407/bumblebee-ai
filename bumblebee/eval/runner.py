"""Eval runner — load YAML task, execute, run judges, pass@k."""
from __future__ import annotations
from pathlib import Path
import yaml

from bumblebee.eval.judges import run_judge
from bumblebee.eval.spec import EvalRunResult, EvalTask


def load_task(path: Path) -> EvalTask:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return EvalTask(**data)


def run_eval_sync(path: Path, repeats: int = 3) -> EvalRunResult:
    """Phase 2 simplified runner: assumes external workflow execution (or stub).

    Runs judges N times. For full workflow execution: requires Phase 1.5+ real harness
    (subprocess claude-cli). Here just validates judge plumbing on existing fixtures.
    """
    task = load_task(path)
    cwd = task.repo or str(path.parent)
    runs = []
    passes = 0
    for _ in range(repeats):
        results = [run_judge(j, cwd) for j in task.judge]
        runs.append(results)
        if all(r.passed for r in results):
            passes += 1
    return EvalRunResult(
        name=task.name,
        pass_rate=(passes / repeats) if repeats else 0.0,
        expected=task.expected_pass_rate,
        runs=repeats,
        judges=runs,
    )


def run_golden_set(golden_dir: Path, repeats: int = 3) -> list[EvalRunResult]:
    """Run all .yaml tasks in golden_dir. Returns list of results."""
    results = []
    for p in sorted(golden_dir.glob("*.yaml")):
        try:
            results.append(run_eval_sync(p, repeats))
        except Exception as e:
            results.append(EvalRunResult(
                name=p.stem, pass_rate=0.0, expected=1.0, runs=0, error=str(e)
            ))
    return results
