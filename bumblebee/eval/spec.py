"""Eval task YAML spec (adapted from ECC agent-eval)."""
from __future__ import annotations
from pydantic import BaseModel, Field


class JudgeSpec(BaseModel):
    type: str  # "pytest" | "grep" | "regex_negative" | "exit_code"
    command: str | None = None
    pattern: str | None = None
    files: list[str] | str | None = None
    must_pass: bool = True
    must_match: bool | None = None


class EvalTask(BaseModel):
    name: str
    description: str = ""
    repo: str | None = None
    files: list[str] = Field(default_factory=list)
    workflow: str = "simple-fix-flow"
    issue: dict = Field(default_factory=dict)
    prompt_overrides: dict = Field(default_factory=dict)
    judge: list[JudgeSpec] = Field(default_factory=list)
    budget: dict = Field(default_factory=dict)
    expected_pass_rate: float = 0.8
    commit: str | None = None


class JudgeResult(BaseModel):
    type: str
    passed: bool
    detail: str = ""


class EvalRunResult(BaseModel):
    name: str
    pass_rate: float
    expected: float
    runs: int
    judges: list[list[JudgeResult]] = Field(default_factory=list)
    error: str | None = None

    @property
    def gate_passes(self) -> bool:
        return self.pass_rate >= self.expected
