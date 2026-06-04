#!/usr/bin/env bash
# Entrypoint for bumblebee-ai Docker image.
# Usage:
#   server     — run migrations + start uvicorn
#   migrate    — run migrations only
#   seed       — run default seed
#   bash       — shell

set -euo pipefail
cmd="${1:-server}"
shift || true

case "$cmd" in
  server)
    echo "[entrypoint] alembic upgrade head"
    alembic upgrade head
    echo "[entrypoint] starting uvicorn on :${API_PORT:-8000}"
    exec uvicorn bumblebee.main:app \
      --host "${API_HOST:-0.0.0.0}" \
      --port "${API_PORT:-8000}" \
      --proxy-headers \
      --forwarded-allow-ips='*'
    ;;
  migrate)
    exec alembic upgrade head
    ;;
  seed)
    exec bumblebee db seed
    ;;
  worker|daemon)
    exec bumblebee daemon "$@"
    ;;
  mcp)
    echo "[entrypoint] starting MCP HTTP server on ${MCP_HOST:-0.0.0.0}:${MCP_PORT:-8080}"
    exec python -c "
import asyncio
from bumblebee_mcp.http_server import serve_http
import os
asyncio.run(serve_http(host=os.getenv('MCP_HOST', '0.0.0.0'), port=int(os.getenv('MCP_PORT', '8080'))))
"
    ;;
  bash|sh)
    exec /bin/bash
    ;;
  *)
    exec "$cmd" "$@"
    ;;
esac
