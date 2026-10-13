#!/bin/sh
# docs/adr/0042 — runs inside the postgres-backup service (the same postgres image
# as the database, so pg_dump is already the right version to match the server). Loops
# forever: dump, prune anything older than the retention window, sleep,
# repeat. See docs/self-hosting.md for the restore runbook — a backup file
# nobody has practiced restoring from isn't a real safety net.
set -eu
# A pipeline is as good as its last command otherwise: `pg_dump | gzip` is gzip's
# status, and gzip is happy to compress nothing. pg_dump failing then left a
# 20-byte file that was logged as a backup, and after the retention window the
# prune removed the good ones behind it. (busybox's ash, which this image has.)
set -o pipefail

BACKUP_DIR=/backups
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

export PGPASSWORD="$POSTGRES_PASSWORD"

# A plain dump ends with this line, written only when pg_dump got to the end: a
# file cut short, or empty, does not have it.
is_complete() {
  gunzip -c "$1" | tail -n 5 | grep -q 'PostgreSQL database dump complete'
}

while true; do
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  dest="$BACKUP_DIR/kometio-$timestamp.sql.gz"
  echo "[pg-backup] Starting dump to $dest"
  if pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$dest.tmp" && is_complete "$dest.tmp"; then
    mv "$dest.tmp" "$dest"
    echo "[pg-backup] Wrote $dest"
    # Only after a good one: a run of failures must not eat the backups that are
    # good, which is all that is left of the site on a day when the database is not.
    find "$BACKUP_DIR" -name 'kometio-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
  else
    echo "[pg-backup] pg_dump failed or the file is not a whole dump, leaving previous backups untouched" >&2
    rm -f "$dest.tmp"
  fi

  sleep "$INTERVAL"
done
