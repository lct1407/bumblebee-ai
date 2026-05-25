"""OTel trace emitter — Plane 7 Observability.

Phase 2 scaffold: provides span helpers + auto-init from OTEL_EXPORTER_OTLP_ENDPOINT env.
NoOp when endpoint unset (default for dev/test).
"""
from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

try:
    from opentelemetry import trace
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    _OTEL_AVAILABLE = True
except ImportError:  # pragma: no cover
    _OTEL_AVAILABLE = False


_initialized = False


def init_tracing(service_name: str = "bumblebee-ai") -> None:
    global _initialized
    if _initialized or not _OTEL_AVAILABLE:
        return
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    # Always include console exporter in dev; production should set OTLP endpoint
    provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    if endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            provider.add_span_processor(
                BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint))
            )
        except ImportError:
            pass
    trace.set_tracer_provider(provider)
    _initialized = True


@contextmanager
def span(name: str, **attributes: Any) -> Iterator[Any]:
    if not _OTEL_AVAILABLE:
        yield None
        return
    tracer = trace.get_tracer("bumblebee")
    with tracer.start_as_current_span(name) as s:
        for k, v in attributes.items():
            try:
                s.set_attribute(k, v)
            except Exception:
                pass
        yield s


def get_tracer():
    if not _OTEL_AVAILABLE:
        return None
    return trace.get_tracer("bumblebee")
