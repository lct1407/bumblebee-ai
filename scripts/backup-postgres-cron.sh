#!/usr/bin/env bash
# Nightly Postgres backup — BB-9.
# Install in crontab: 0 2 * * * /path/to/scripts/backup-postgres-cron.sh
#
# Env required:
#   DATABASE_URL                — postgresql://user:pw@host:port/db
#   BACKUP_DIR (optional)       — local dir, default /var/backups/bumblebee
#   BACKUP_S3_BUCKET (optional) — if set, copies dump there via aws CLI
#   BACKUP_RETENTION_DAYS       — default 14
set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/bumblebee}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/bumblebee-${TS}.sql.gz"

# Strip the +asyncpg driver suffix that SQLAlchemy uses
PG_URL="${DATABASE_URL/+asyncpg/}"

echo "[backup] dumping → $OUT"
pg_dump --no-owner --no-acl --format=plain "$PG_URL" | gzip -9 > "$OUT"
echo "[backup] size: $(du -h "$OUT" | cut -f1)"

# Optional: ship to S3
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    if command -v aws >/dev/null 2>&1; then
        aws s3 cp "$OUT" "s3://$BACKUP_S3_BUCKET/postgres/$(basename "$OUT")"
        echo "[backup] uploaded to s3://$BACKUP_S3_BUCKET/postgres/"
    else
        echo "[backup] aws CLI not found — skipping S3 upload"
    fi
fi

# Retention
find "$BACKUP_DIR" -name "bumblebee-*.sql.gz" -mtime "+$RETENTION" -delete
echo "[backup] retention applied (kept ${RETENTION} days)"
