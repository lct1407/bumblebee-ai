# Multi-stage Dockerfile for production deployment.
# Build: docker build -t bumblebee-ai:0.4.0 .
# Run:   docker run --rm -p 8000:8000 -e DATABASE_URL=... bumblebee-ai:0.4.0

FROM python:3.12-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev gcc git && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
COPY bumblebee/ ./bumblebee/
COPY alembic/ ./alembic/
COPY alembic.ini ./
RUN pip install --upgrade pip build && python -m build --wheel

FROM python:3.12-slim AS runtime
LABEL org.opencontainers.image.title="bumblebee-ai"
LABEL org.opencontainers.image.description="Multi-agent concurrent task management platform"
LABEL org.opencontainers.image.version="0.4.0"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/lct1407/bumblebee"

# Non-root user
RUN useradd -m -u 1000 bumblebee
WORKDIR /app

# Install runtime deps only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Install wheel from builder
COPY --from=builder /build/dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl && rm /tmp/*.whl

# Copy alembic for migrations at startup
COPY --from=builder /build/alembic /app/alembic
COPY --from=builder /build/alembic.ini /app/alembic.ini
COPY --chown=bumblebee:bumblebee scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown -R bumblebee:bumblebee /app

USER bumblebee

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["server"]
