"""Agent loop — the Plane 3 Execution core as a LangGraph StateGraph.

Graph topology (standard agentic loop):

    START → safety → invoke ──┬→ tools → safety  (bounded cycle)
                              └→ END
    safety/tools short-circuit to END with state["failure"] set when the
    budget/quota is exhausted or the loop detector trips.

Each cycle: safety pre-check (session budget + workspace quota) → LLM invoke
(streaming when supported) → execute requested tools via ToolExecutor and feed
ToolResult summaries back into the prompt. The cycle is bounded by
max_iterations; the surrounding harness owns session lifecycle, output parsing
and failure finalization.

Tool requests arrive either natively (LLMResponse.tool_uses) or via the text
protocol: a JSON reply shaped {"tool_call": {"name": ..., "args": {...}}}
(or {"tool_calls": [...]}) as instructed by the assembled system prompt.
"""
from __future__ import annotations

import json
import logging
import os
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.agent_session import AgentSession, FailureReason
from bumblebee.services.execution.context_assembler import Prompt
from bumblebee.services.execution.llm_provider import (
    LLMProvider,
    LLMResponse,
    ToolUseRequest,
)
from bumblebee.services.execution.streaming import invoke_with_streaming
from bumblebee.services.safety.budget_enforcer import (
    BudgetExceeded,
    check_session_budget,
    estimate_cost,
)
from bumblebee.services.safety.loop_detector import detect_loop
from bumblebee.services.state.event_log import append_event
from bumblebee.services.tool.result import ToolResult

logger = logging.getLogger(__name__)


class AgentLoopState(TypedDict, total=False):
    """Shared state flowing between graph nodes (in-process, not checkpointed)."""
    prompt: Prompt
    response: LLMResponse | None
    tool_requests: list[ToolUseRequest]
    iterations: int
    failure: dict | None  # {"reason": FailureReason, "detail": str, "extra": dict}


async def run_agent_loop(
    db: AsyncSession,
    *,
    session: AgentSession,
    role: str,
    provider: LLMProvider,
    prompt: Prompt,
    max_iterations: int,
) -> AgentLoopState:
    """Build, compile and run the loop graph for one agent session."""
    graph = build_agent_loop(
        db, session=session, role=role, provider=provider, max_iterations=max_iterations
    )
    initial: AgentLoopState = {
        "prompt": prompt, "response": None, "tool_requests": [],
        "iterations": 0, "failure": None,
    }
    # Each cycle is 3 supersteps (safety → invoke → tools); headroom for entry/exit.
    limit = 3 * (max_iterations + 2) + 5
    return await graph.ainvoke(initial, config={"recursion_limit": limit})


def build_agent_loop(
    db: AsyncSession,
    *,
    session: AgentSession,
    role: str,
    provider: LLMProvider,
    max_iterations: int,
):
    """Compile the StateGraph. Non-serializable deps stay in node closures."""

    async def safety(state: AgentLoopState) -> dict:
        try:
            await check_session_budget(db, session)
        except BudgetExceeded as e:
            return {"failure": {"reason": FailureReason.BUDGET_EXCEEDED, "detail": str(e)}}
        # Workspace quota — separate from per-session budget. Free/Pro plans
        # have a monthly LLM spend cap; Team is unlimited (passthrough).
        if session.workspace_id:
            try:
                from bumblebee.services.billing.quota import (
                    QuotaExceeded,
                    check_workspace_quota,
                )
                await check_workspace_quota(db, session.workspace_id)
            except QuotaExceeded as e:
                return {"failure": {
                    "reason": FailureReason.BUDGET_EXCEEDED, "detail": str(e),
                    "extra": {"upgrade_required": True},
                }}
        return {}

    async def invoke(state: AgentLoopState) -> dict:
        streaming_enabled = os.environ.get("BUMBLEBEE_STREAMING", "1") != "0"
        if streaming_enabled and getattr(provider, "supports_streaming", False):
            response = await invoke_with_streaming(db, session, role, provider, state["prompt"])
        else:
            response = await provider.invoke(state["prompt"])
        await _account_llm_call(db, session, response)
        return {"response": response, "tool_requests": extract_tool_requests(response)}

    async def tools(state: AgentLoopState) -> dict:
        requests = state["tool_requests"]
        results = await _execute_tools(db, session, requests)
        # Loop detector keys on tool_call events (same tool + same args repeats)
        if await detect_loop(db, session.id):
            return {"failure": {"reason": FailureReason.INFINITE_LOOP, "detail": "loop detected"}}
        return {
            "prompt": _with_tool_results(state["prompt"], requests, results),
            "iterations": state["iterations"] + 1,
        }

    def after_safety(state: AgentLoopState) -> str:
        return "fail" if state.get("failure") else "invoke"

    def after_invoke(state: AgentLoopState) -> str:
        if state["tool_requests"] and state["iterations"] < max_iterations:
            return "tools"
        return "done"

    def after_tools(state: AgentLoopState) -> str:
        return "fail" if state.get("failure") else "safety"

    graph = StateGraph(AgentLoopState)
    graph.add_node("safety", safety)
    graph.add_node("invoke", invoke)
    graph.add_node("tools", tools)
    graph.add_edge(START, "safety")
    graph.add_conditional_edges("safety", after_safety, {"invoke": "invoke", "fail": END})
    graph.add_conditional_edges("invoke", after_invoke, {"tools": "tools", "done": END})
    graph.add_conditional_edges("tools", after_tools, {"safety": "safety", "fail": END})
    return graph.compile()


def extract_tool_requests(response: LLMResponse) -> list[ToolUseRequest]:
    """Tool requests: native (response.tool_uses) or text protocol (tool_call JSON)."""
    if response.tool_uses:
        return list(response.tool_uses)

    text = (response.text or "").strip()
    if not text.startswith("{"):
        return []
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, dict):
        return []

    raw = data.get("tool_calls")
    if raw is None and isinstance(data.get("tool_call"), dict):
        raw = [data["tool_call"]]
    if not isinstance(raw, list):
        return []

    requests: list[ToolUseRequest] = []
    for item in raw:
        if isinstance(item, dict) and isinstance(item.get("name"), str):
            args = item.get("args")
            requests.append(ToolUseRequest(
                name=item["name"],
                args=args if isinstance(args, dict) else {},
            ))
    return requests


async def _account_llm_call(
    db: AsyncSession, session: AgentSession, response: LLMResponse
) -> None:
    """Accrue tokens/cost on the session + emit llm_call/cost_charged events."""
    cost = estimate_cost(response.tokens_in or 1000, response.tokens_out or 200,
                         model=response.model or "stub")
    session.tokens_in += (response.tokens_in or 1000)
    session.tokens_out += (response.tokens_out or 200)
    session.dollars_used += cost

    await append_event(
        db, type="llm_call", session_id=session.id, issue_id=session.issue_id,
        payload={
            "model": response.model,
            "tokens_in": response.tokens_in,
            "tokens_out": response.tokens_out,
            "cost_usd": cost,
        },
        source="agent",
    )
    await append_event(
        db, type="cost_charged", session_id=session.id, issue_id=session.issue_id,
        payload={"amount_usd": cost, "cumulative_usd": session.dollars_used},
        source="system",
    )

    # Record workspace usage + Stripe metered passthrough (Team plan only)
    if session.workspace_id and cost > 0:
        try:
            from bumblebee.services.billing.quota import record_usage
            await record_usage(
                db, session.workspace_id, cost,
                event_idempotency_key=f"session-{session.id}-{session.tokens_in + session.tokens_out}",
            )
        except Exception as exc:
            logger.warning("usage record failed: %s", exc)


async def _execute_tools(
    db: AsyncSession,
    session: AgentSession,
    requests: list[ToolUseRequest],
) -> list[ToolResult]:
    from bumblebee.services.tool.executor import get_executor
    executor = get_executor()
    results: list[ToolResult] = []
    for req in requests:
        results.append(await executor.execute(req.name, req.args, session, db))
    return results


def _with_tool_results(
    prompt: Prompt,
    requests: list[ToolUseRequest],
    results: list[ToolResult],
) -> Prompt:
    """Append ToolResult summaries to the user prompt (data stays out of context)."""
    lines = ["## Tool results"]
    for req, res in zip(requests, results):
        line = f"- {req.name} -> {res.status}: {res.summary}"
        if res.artifacts:
            line += f" (artifacts: {', '.join(res.artifacts)})"
        if res.next_actions:
            line += f" [next: {'; '.join(res.next_actions)}]"
        lines.append(line)
    lines.append(
        "Use these results to continue. Reply with your final output, "
        "or another tool_call JSON if more information is required."
    )
    return Prompt(
        system=prompt.system,
        user=prompt.user + "\n\n" + "\n".join(lines),
        tools=prompt.tools,
    )
