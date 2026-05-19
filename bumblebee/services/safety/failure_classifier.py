"""FailureClassifier: rule-based taxonomy of failures (Plane 5). LLM judge later."""
from bumblebee.models.agent_session import FailureReason


_RULES: list[tuple[FailureReason, list[str]]] = [
    (FailureReason.TIMEOUT, ["timeout", "deadline exceeded", "wall time"]),
    (FailureReason.CONTEXT_EXHAUST, ["context length", "max tokens", "context limit", "too many tokens"]),
    (FailureReason.BUDGET_EXCEEDED, ["budget exceeded", "cost cap", "spending limit"]),
    (FailureReason.INFINITE_LOOP, ["loop detected", "same tool repeated"]),
    (FailureReason.TOOL_ERROR, ["tool error", "function call failed", "schema validation"]),
    (FailureReason.HALLUCINATION, ["hallucination", "fabricated", "not real", "does not exist"]),
    (FailureReason.GOAL_DRIFT, ["off-topic", "drifted", "lost focus", "goal mismatch"]),
    (FailureReason.PLANNING_BRITTLENESS, ["plan broken", "step failed", "world changed"]),
    (FailureReason.INFRA, ["rate limit", "503", "502", "504", "connection refused", "network"]),
]


def classify_failure(error_text: str) -> FailureReason:
    """Classify by simple keyword rules. Cheap + fast."""
    if not error_text:
        return FailureReason.UNKNOWN
    text = error_text.lower()
    for reason, keywords in _RULES:
        for kw in keywords:
            if kw in text:
                return reason
    return FailureReason.UNKNOWN


def recommend_mitigation(reason: FailureReason) -> dict:
    """Return mitigation strategy: action + params."""
    strategies = {
        FailureReason.TIMEOUT: {"action": "split_into_subagents", "params": {}},
        FailureReason.CONTEXT_EXHAUST: {"action": "compact_and_retry", "params": {"compact_ratio": 0.5}},
        FailureReason.BUDGET_EXCEEDED: {"action": "escalate_human", "params": {}},
        FailureReason.INFINITE_LOOP: {"action": "escalate_human", "params": {"reason": "loop"}},
        FailureReason.TOOL_ERROR: {"action": "retry_with_hint", "params": {}},
        FailureReason.HALLUCINATION: {"action": "fact_check_and_retry", "params": {}},
        FailureReason.GOAL_DRIFT: {"action": "reanchor_and_retry", "params": {}},
        FailureReason.PLANNING_BRITTLENESS: {"action": "replan_from_current", "params": {}},
        FailureReason.INFRA: {"action": "backoff_retry", "params": {"backoff_seconds": 30}},
        FailureReason.UNKNOWN: {"action": "escalate_human", "params": {}},
    }
    return strategies.get(reason, {"action": "escalate_human", "params": {}})
