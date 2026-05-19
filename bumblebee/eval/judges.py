"""Eval judges — pytest / grep / regex_negative / exit_code."""
from __future__ import annotations
import re
import shlex
import subprocess
from pathlib import Path

from bumblebee.eval.spec import JudgeResult, JudgeSpec


def judge_pytest(spec: JudgeSpec, cwd: str) -> JudgeResult:
    if not spec.command:
        return JudgeResult(type="pytest", passed=False, detail="missing command")
    try:
        proc = subprocess.run(
            shlex.split(spec.command, posix=False), cwd=cwd, capture_output=True, timeout=600
        )
        passed = (proc.returncode == 0)
        return JudgeResult(
            type="pytest", passed=passed,
            detail=proc.stdout.decode("utf-8", errors="replace")[-500:],
        )
    except subprocess.TimeoutExpired:
        return JudgeResult(type="pytest", passed=False, detail="timeout")


def judge_grep(spec: JudgeSpec, cwd: str) -> JudgeResult:
    if not spec.pattern:
        return JudgeResult(type="grep", passed=False, detail="missing pattern")
    files = spec.files if isinstance(spec.files, list) else [spec.files] if spec.files else []
    matched = False
    for f in files:
        p = Path(cwd) / f
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        if re.search(spec.pattern, text):
            matched = True
            break
    must = spec.must_match if spec.must_match is not None else True
    passed = (matched == must)
    return JudgeResult(type="grep", passed=passed, detail=f"matched={matched} expected={must}")


def judge_regex_negative(spec: JudgeSpec, cwd: str) -> JudgeResult:
    """Pattern must NOT match in files."""
    if not spec.pattern:
        return JudgeResult(type="regex_negative", passed=False, detail="missing pattern")
    files = spec.files if isinstance(spec.files, list) else [spec.files] if spec.files else []
    found = False
    for f in files:
        p = Path(cwd) / f
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        if re.search(spec.pattern, text):
            found = True
            break
    return JudgeResult(type="regex_negative", passed=(not found), detail=f"found={found}")


def judge_exit_code(spec: JudgeSpec, cwd: str) -> JudgeResult:
    if not spec.command:
        return JudgeResult(type="exit_code", passed=False, detail="missing command")
    try:
        proc = subprocess.run(shlex.split(spec.command, posix=False), cwd=cwd, capture_output=True, timeout=120)
        return JudgeResult(
            type="exit_code",
            passed=(proc.returncode == 0),
            detail=f"rc={proc.returncode}",
        )
    except subprocess.TimeoutExpired:
        return JudgeResult(type="exit_code", passed=False, detail="timeout")


JUDGE_MAP = {
    "pytest": judge_pytest,
    "grep": judge_grep,
    "regex_negative": judge_regex_negative,
    "exit_code": judge_exit_code,
}


def run_judge(spec: JudgeSpec, cwd: str) -> JudgeResult:
    fn = JUDGE_MAP.get(spec.type)
    if not fn:
        return JudgeResult(type=spec.type, passed=False, detail=f"unknown judge type")
    return fn(spec, cwd)
