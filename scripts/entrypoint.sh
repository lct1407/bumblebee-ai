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
  bash|sh)
    exec /bin/bash
    ;;
  *)
    exec "$cmd" "$@"
    ;;
esac
