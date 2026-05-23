#!/bin/bash
# Bumblebee — daily Postgres backup script.
# Usage:
#   ./scripts/backup.sh                       # uses .env + writes to BUMBLEBEE_BACKUP_PATH
#   ./scripts/backup.sh s3://my-bucket/path   # uploads to S3 via aws CLI
#
# Schedule via cron:
#   0 3 * * * cd /opt/bumblebee && ./scripts/backup.sh >> /var/log/bumblebee-backup.log 2>&1
#
# Output: bumblebee-YYYYMMDD-HHMMSS.sql.gz (encrypted if GPG_RECIPIENT set)

set -euo pipefail

# Load .env if present (no-op if absent)
if [ -f .env ]; then
  set -o allexport
  source .env
  set +o allexport
fi

# Parse DATABASE_URL — strip the asyncpg dialect, pg_dump expects plain libpq URL.
PG_URL="${DATABASE_URL//postgresql+asyncpg/postgresql}"
if [ -z "$PG_URL" ]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 1
fi

TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
DEST="${1:-${BUMBLEBEE_BACKUP_PATH:-./backups}}"
FILE="bumblebee-${TIMESTAMP}.sql.gz"

echo "[backup] starting → ${DEST}/${FILE}"
mkdir -p "$(dirname "$DEST/$FILE")" 2>/dev/null || true

# Dump → gzip → optional GPG → destination
DUMP_CMD="pg_dump --no-owner --no-acl --clean --if-exists \"$PG_URL\" | gzip -9"

if [ -n "${GPG_RECIPIENT:-}" ]; then
  echo "[backup] encrypting for ${GPG_RECIPIENT}"
  DUMP_CMD="$DUMP_CMD | gpg --encrypt --recipient \"$GPG_RECIPIENT\" --trust-model always"
  FILE="${FILE}.gpg"
fi

case "$DEST" in
  s3://*)
    eval "$DUMP_CMD" | aws s3 cp - "${DEST%/}/$FILE"
    ;;
  *)
    mkdir -p "$DEST"
    eval "$DUMP_CMD" > "$DEST/$FILE"
    ;;
esac

echo "[backup] done: $FILE"

# Retention — keep last 30 days locally (S3 lifecycle handles S3 retention)
if [[ "$DEST" != s3://* ]]; then
  find "$DEST" -name "bumblebee-*.sql.gz*" -mtime +30 -delete 2>/dev/null || true
  echo "[backup] purged backups older than 30 days"
fi
