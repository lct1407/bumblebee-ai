"""LLM Provider abstraction. Phase 1: stub + claude-cli wired; OpenAI/Gemini stubs."""
from __future__ import annotations
import asyncio
import json
import os
import shutil
import subprocess
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from bumblebee.services.execution.context_assembler import Prompt


@dataclass
class ToolUseRequest:
    name: str
    args: dict


@dataclass
class LLMResponse:
    text: str = ""
    tool_uses: list[ToolUseRequest] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    model: str = ""
    finish_reason: str = "stop"
    raw: Any = None


class LLMProvider(ABC):
    name: str

    @abstractmethod
    async def invoke(self, prompt: Prompt, max_tokens: int = 4096) -> LLMResponse: ...


class StubProvider(LLMProvider):
    """Stub provider: returns canned responses per role keyword detected in system prompt."""
    name = "stub"

    async def invoke(self, prompt: Prompt, max_tokens: int = 4096) -> LLMResponse:
        sys = prompt.system.lower()
        if "triager" in sys:
            text = '{"complexity":"simple","ai_summary":"Stub triage","ai_confidence":0.85}'
        elif "coordinator" in sys:
            text = '{"plan_summary":"Stub plan: 1 subtask","sub_tasks":[{"role":"implementer","scope":["src/**"]}]}'
        elif "implementer" in sys:
            text = "Stub implementation complete."
        elif "tester" in sys:
            text = '{"tests_run":0,"passed":0,"verdict":"skip_stub"}'
        elif "reviewer" in sys:
            text = '{"verdict":"approve","comments":[]}'
        elif "assistant" in sys:
            text = "Hello from stub assistant"
        else:
            text = "(stub: unknown role)"
        return LLMResponse(
            text=text, tokens_in=len(prompt.system) // 4, tokens_out=len(text) // 4,
            model="stub", finish_reason="stop",
        )


class ClaudeCLIProvider(LLMProvider):
    """Real claude-cli subprocess provider.

    Requires `claude` binary on PATH. Calls `claude -p PROMPT --output-format json`.
    Parses JSON output to extract text + token usage.
    """
    name = "claude-cli"

    def __init__(self, binary: str = "claude", model: str | None = None):
        self.binary = binary
        self.model = model

    async def invoke(self, prompt: Prompt, max_tokens: int = 4096) -> LLMResponse:
        # Resolve binary (Windows: try .cmd / .exe variants)
        candidates = [self.binary, f"{self.binary}.cmd", f"{self.binary}.exe"]
        resolved = None
        for c in candidates:
            if shutil.which(c):
                resolved = shutil.which(c)
                break
        if resolved is None:
            return await StubProvider().invoke(prompt, max_tokens)

        full = f"{prompt.system}\n\n{prompt.user}"
        cmd = [resolved, "-p", "--output-format", "json"]
        if self.model:
            cmd.extend(["--model", self.model])

        # Use sync subprocess via thread pool (works with SelectorEventLoop on Windows).
        def _run_sync() -> tuple[int, bytes, bytes]:
            use_shell = resolved.lower().endswith(".cmd")
            proc = subprocess.run(
                subprocess.list2cmdline(cmd) if use_shell else cmd,
                shell=use_shell,
                input=full.encode("utf-8"),
                capture_output=True,
                timeout=300,
            )
            return proc.returncode, proc.stdout, proc.stderr

        try:
            rc, stdout, stderr = await asyncio.to_thread(_run_sync)
        except subprocess.TimeoutExpired:
            return LLMResponse(text="", finish_reason="timeout", model="claude-cli")

        if rc != 0:
            return LLMResponse(
                text=f"claude-cli error: {stderr.decode(errors='replace')[:300]}",
                finish_reason="error",
                model="claude-cli",
            )

        # Parse JSON output
        try:
            data = json.loads(stdout.decode())
            text = data.get("result", data.get("text", ""))
            usage = data.get("usage", {})
            return LLMResponse(
                text=text,
                tokens_in=usage.get("input_tokens", 0),
                tokens_out=usage.get("output_tokens", 0),
                model=data.get("model", "claude"),
                finish_reason=data.get("stop_reason", "stop"),
                raw=data,
            )
        except (json.JSONDecodeError, KeyError):
            # claude-cli might return plain text instead
            text = stdout.decode()
            return LLMResponse(
                text=text, tokens_in=0, tokens_out=len(text) // 4,
                model="claude-cli-text", finish_reason="stop",
            )


def get_provider(name: str = "stub") -> LLMProvider:
    """Provider factory. Reads env BUMBLEBEE_PROVIDER to override."""
    name = os.environ.get("BUMBLEBEE_PROVIDER", name)
    if name == "stub":
        return StubProvider()
    if name in ("claude-cli", "claude"):
        return ClaudeCLIProvider()
    return StubProvider()  # default fallback
