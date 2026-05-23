"""LLM Provider abstraction. Phase 1: stub + claude-cli wired; OpenAI/Gemini stubs.

Streaming (Phase 8+): providers may implement `invoke_streaming(prompt, on_chunk)`
to yield token-by-token deltas. Each chunk passed to `on_chunk` is broadcast over
WebSocket so the web UI can render live output. Only the final aggregate is
persisted as an `llm_call` event (chunks are ephemeral to avoid DB bloat).
"""
from __future__ import annotations
import asyncio
import json
import os
import shutil
import subprocess
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from bumblebee.services.execution.context_assembler import Prompt

ChunkHandler = Callable[[dict], Awaitable[None]]


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
    supports_streaming: bool = False

    @abstractmethod
    async def invoke(self, prompt: Prompt, max_tokens: int = 4096) -> LLMResponse: ...

    async def invoke_streaming(
        self,
        prompt: Prompt,
        on_chunk: ChunkHandler,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Default fallback: call invoke and emit single 'text' chunk at end.
        Real streaming providers override this with token-by-token deltas.
        """
        response = await self.invoke(prompt, max_tokens=max_tokens)
        await on_chunk({"type": "delta", "text": response.text})
        return response


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

    Requires `claude` binary on PATH.
    - `invoke`: single-shot `claude -p --output-format json`.
    - `invoke_streaming`: `claude -p --output-format stream-json --verbose`,
      reads NDJSON line-by-line via a thread (Windows asyncio-subprocess safe).
    """
    name = "claude-cli"
    supports_streaming = True

    def __init__(self, binary: str = "claude", model: str | None = None):
        self.binary = binary
        self.model = model

    def _resolve_binary(self) -> str | None:
        for c in [self.binary, f"{self.binary}.cmd", f"{self.binary}.exe"]:
            p = shutil.which(c)
            if p:
                return p
        return None

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

    async def invoke_streaming(
        self,
        prompt: Prompt,
        on_chunk: ChunkHandler,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Stream NDJSON from claude-cli. Each line is parsed and yielded as a chunk.

        Chunk types emitted to `on_chunk`:
        - {"type":"started","model":...}        — first message from CLI
        - {"type":"delta","text":"..."}         — text delta (token-ish)
        - {"type":"tool_use","name":...,"input":...}
        - {"type":"tool_result","output":...}
        - {"type":"completed","tokens_in":...,"tokens_out":...,"cost_usd":...}
        - {"type":"error","message":...}
        """
        resolved = self._resolve_binary()
        if resolved is None:
            return await StubProvider().invoke_streaming(prompt, on_chunk, max_tokens)

        full = f"{prompt.system}\n\n{prompt.user}"
        cmd = [resolved, "-p", "--output-format", "stream-json", "--verbose"]
        if self.model:
            cmd.extend(["--model", self.model])

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        SENTINEL = object()

        def producer():
            """Reads stdout line-by-line in a thread, pushes to the asyncio queue."""
            try:
                use_shell = resolved.lower().endswith(".cmd")
                proc = subprocess.Popen(
                    subprocess.list2cmdline(cmd) if use_shell else cmd,
                    shell=use_shell,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=1,
                )
                assert proc.stdin and proc.stdout
                proc.stdin.write(full.encode("utf-8"))
                proc.stdin.close()
                for raw in proc.stdout:
                    line = raw.decode(errors="replace").strip()
                    if line:
                        loop.call_soon_threadsafe(queue.put_nowait, line)
                proc.wait(timeout=600)
            except Exception as exc:
                loop.call_soon_threadsafe(queue.put_nowait, json.dumps({
                    "type": "_internal_error", "message": str(exc),
                }))
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

        asyncio.create_task(asyncio.to_thread(producer))

        text_parts: list[str] = []
        tokens_in = tokens_out = 0
        cost_usd = 0.0
        model = "claude-cli"
        finish_reason = "stop"

        while True:
            item = await queue.get()
            if item is SENTINEL:
                break
            try:
                data = json.loads(item)
            except json.JSONDecodeError:
                continue

            t = data.get("type", "")
            # claude-cli stream-json shapes (best-effort decoder)
            if t == "system" or t == "init":
                model = data.get("model", model)
                await on_chunk({"type": "started", "model": model})
            elif t == "assistant" or t == "message":
                msg = data.get("message", {})
                for block in msg.get("content", []) if isinstance(msg, dict) else []:
                    if block.get("type") == "text" and block.get("text"):
                        text_parts.append(block["text"])
                        await on_chunk({"type": "delta", "text": block["text"]})
            elif t == "content_block_delta":
                delta = data.get("delta", {}).get("text") or data.get("delta", {}).get("partial_json", "")
                if delta:
                    text_parts.append(delta)
                    await on_chunk({"type": "delta", "text": delta})
            elif t == "tool_use":
                await on_chunk({
                    "type": "tool_use",
                    "name": data.get("name"),
                    "input": data.get("input"),
                })
            elif t == "tool_result" or t == "user":
                await on_chunk({"type": "tool_result", "output": data.get("content")})
            elif t == "result":
                tokens_in = data.get("usage", {}).get("input_tokens", 0)
                tokens_out = data.get("usage", {}).get("output_tokens", 0)
                cost_usd = data.get("total_cost_usd", data.get("cost_usd", 0.0))
                finish_reason = data.get("subtype", data.get("stop_reason", "stop"))
                # Some claude-cli versions only return the final text here
                final = data.get("result")
                if final and not text_parts:
                    text_parts.append(final)
                await on_chunk({
                    "type": "completed",
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                    "cost_usd": cost_usd,
                })
            elif t == "_internal_error":
                await on_chunk({"type": "error", "message": data.get("message", "")})
                finish_reason = "error"

        return LLMResponse(
            text="".join(text_parts),
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            model=model,
            finish_reason=finish_reason,
        )


class GeminiProvider(LLMProvider):
    """Vertex AI Gemini provider via the modern `google-genai` SDK.

    Uses Vertex AI mode (NOT the public Gemini Developer API) because the user's
    auth is a Vertex AI API key tied to a GCP project. Configured via:
      VERTEX_AI_PROJECT     — GCP project id
      VERTEX_AI_LOCATION    — region (e.g. 'global' or 'us-central1')
      VERTEX_AI_API_KEY     — Vertex API key (NOT a Gemini Developer API key)
      GEMINI_MODEL          — default 'gemini-2.0-flash'

    Falls back to plain Gemini Developer API if VERTEX_AI_PROJECT is unset but
    GEMINI_API_KEY is provided.
    """
    name = "gemini"
    supports_streaming = False

    def __init__(self, model: str | None = None):
        from bumblebee.config import get_settings
        s = get_settings()
        # Vertex AI mode requires ADC auth (gcloud login or service account JSON),
        # NOT an API key. The google-genai SDK explicitly rejects api_key + project.
        # We use Vertex mode only when project is set AND no api_key fallback is
        # available — otherwise default to Gemini Developer API mode with the
        # api key (which happens to also be exposed as VERTEX_AI_API_KEY for legacy
        # config compatibility).
        self.gemini_api_key = (
            s.gemini_api_key
            or s.vertex_ai_api_key
            or os.environ.get("GEMINI_API_KEY", "")
        )
        self.use_vertex_adc = bool(s.vertex_ai_project and not self.gemini_api_key)
        self.vertex_project = s.vertex_ai_project
        self.vertex_location = s.vertex_ai_location or "global"
        self.model_name = model or s.gemini_model or "gemini-2.0-flash"

    async def invoke(self, prompt: Prompt, max_tokens: int = 4096) -> LLMResponse:
        if not (self.use_vertex_adc or self.gemini_api_key):
            return LLMResponse(
                text="(gemini: neither GEMINI_API_KEY/VERTEX_AI_API_KEY nor VERTEX_AI_PROJECT (with ADC) configured)",
                finish_reason="error",
                model="gemini",
            )

        def _call() -> dict:
            from google import genai
            from google.genai import types

            if self.use_vertex_adc:
                # True Vertex AI via Application Default Credentials
                # (gcloud auth application-default login OR GOOGLE_APPLICATION_CREDENTIALS env)
                client = genai.Client(
                    vertexai=True,
                    project=self.vertex_project,
                    location=self.vertex_location,
                )
            else:
                # Gemini Developer API path — uses api key against generativelanguage.googleapis.com
                client = genai.Client(api_key=self.gemini_api_key)

            response = client.models.generate_content(
                model=self.model_name,
                contents=prompt.user,
                config=types.GenerateContentConfig(
                    system_instruction=prompt.system,
                    temperature=0.2,
                    max_output_tokens=max_tokens,
                ),
            )

            text = ""
            try:
                text = response.text or ""
            except Exception:
                for cand in getattr(response, "candidates", []) or []:
                    for part in getattr(cand.content, "parts", []) or []:
                        text += getattr(part, "text", "") or ""

            usage = getattr(response, "usage_metadata", None)
            return {
                "text": text,
                "tokens_in": getattr(usage, "prompt_token_count", 0) if usage else 0,
                "tokens_out": getattr(usage, "candidates_token_count", 0) if usage else 0,
            }

        try:
            data = await asyncio.to_thread(_call)
        except Exception as exc:
            return LLMResponse(
                text=f"gemini error: {str(exc)[:300]}",
                finish_reason="error",
                model=self.model_name,
            )

        return LLMResponse(
            text=data["text"],
            tokens_in=data["tokens_in"],
            tokens_out=data["tokens_out"],
            model=self.model_name,
            finish_reason="stop",
        )


def get_provider(name: str = "stub") -> LLMProvider:
    """Provider factory. Reads env BUMBLEBEE_PROVIDER to override."""
    name = os.environ.get("BUMBLEBEE_PROVIDER", name)
    if name == "stub":
        return StubProvider()
    if name in ("claude-cli", "claude"):
        return ClaudeCLIProvider()
    if name in ("gemini", "google"):
        return GeminiProvider()
    return StubProvider()  # default fallback
