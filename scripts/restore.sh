#!/bin/bash
# Bumblebee — restore Postgres from a backup file produced by ./scripts/backup.sh
#
# Usage:
#   ./scripts/restore.sh backups/bumblebee-20260522-030000.sql.gz
#   ./scripts/restore.sh s3://my-bucket/path/bumblebee-XXXX.sql.gz
#
# DANGER: drops + recreates schema. Always test on staging first.

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup_file_or_s3_url>" >&2
  exit 1
fi

if [ -f .env ]; then
  set -o allexport; source .env; set +o allexport
fi

PG_URL="${DATABASE_URL//postgresql+asyncpg/postgresql}"
if [ -z "$PG_URL" ]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 1
fi

SRC="$1"
read -p "About to RESTORE into ${PG_URL%@*}@*** (target=${PG_URL##*@}). Type the database name to confirm: " CONFIRM
DB_NAME=$(echo "$PG_URL" | sed -E 's|.*/([^?]+).*|\1|')
if [ "$CONFIRM" != "$DB_NAME" ]; then
  echo "Mismatch (expected '$DB_NAME'). Aborting." >&2
  exit 1
fi

# Resolve source → local file
TMPFILE=""
case "$SRC" in
  s3://*)
    TMPFILE=$(mktemp)
    echo "[restore] downloading $SRC → $TMPFILE"
    aws s3 cp "$SRC" "$TMPFILE"
    INPUT="$TMPFILE"
    ;;
  *)
    INPUT="$SRC"
    ;;
esac

# Decompress + decrypt as needed, then pipe to psql.
if [[ "$INPUT" == *.gpg ]]; then
  echo "[restore] decrypting + decompressing + applying"
  gpg --decrypt "$INPUT" | gunzip | psql "$PG_URL"
elif [[ "$INPUT" == *.gz ]]; then
  echo "[restore] decompressing + applying"
  gunzip -c "$INPUT" | psql "$PG_URL"
else
  echo "[restore] applying"
  psql "$PG_URL" < "$INPUT"
fi

[ -n "$TMPFILE" ] && rm -f "$TMPFILE"
echo "[restore] done"
