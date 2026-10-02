#!/bin/sh
# docs/adr/0042 — runs inside the postgres-backup service (postgres:16-alpine,
# so pg_dump is already the right version to match the server). Loops
# forever: dump, prune anything older than the retention window, sleep,
# repeat. See docs/self-hosting.md for the restore runbook — a backup file
# nobody has practiced restoring from isn't a real safety net.
set -eu

BACKUP_DIR=/backups
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

export PGPASSWORD="$POSTGRES_PASSWORD"

while true; do
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  dest="$BACKUP_DIR/kometio-$timestamp.sql.gz"
  echo "[pg-backup] Starting dump to $dest"
  if pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$dest.tmp"; then
    mv "$dest.tmp" "$dest"
    echo "[pg-backup] Wrote $dest"
  else
    echo "[pg-backup] pg_dump failed, leaving previous backups untouched" >&2
    rm -f "$dest.tmp"
  fi

  find "$BACKUP_DIR" -name 'kometio-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

  sleep "$INTERVAL"
done
