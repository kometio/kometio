#!/bin/bash
# A snapshot of this machine's database, into _data/ (gitignored).
#
# The docs site's 100 pages, every theme setting and every term live in
# Postgres and nowhere else: none of it is in this repository, so a lost
# disk is a lost site. This is the local half of the answer — the other
# half is copying what it writes somewhere that is not this machine.
#
# Deliberately NOT committed. The dump carries password hashes, session
# rows, form submissions people sent in confidence and any media metadata
# — none of that belongs in a public repository, whatever it would do for
# reproducibility. If versioned content is the goal, the thing to export
# is published page content alone, which is a different tool.
#
# Usage:  ./tools/dump-database.sh [name]
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/_data"
mkdir -p "$OUT"

if [ -f "$REPO/.env" ]; then
  set -a; . "$REPO/.env"; set +a
fi
# Built from the same pieces the application uses (adminConnectionString
# in libs/adapters/postgres-db) rather than a DATABASE_URL this project
# has never had — one place to be wrong is better than two, and a
# self-hoster who edited .env should not have to also learn a URL format.
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set — is .env filled in?}"
HOST="${POSTGRES_HOST:-localhost}"
PORT="${POSTGRES_PORT:-5432}"
DB="${POSTGRES_DB:-kometio}"
USER="${POSTGRES_USER:-kometio}"
DATABASE_URL="postgres://$USER:$POSTGRES_PASSWORD@$HOST:$PORT/$DB"

STAMP="$(date +%Y-%m-%d-%H%M%S)"
NAME="${1:-kometio}"
DEST="$OUT/$NAME-$STAMP.sql.gz"

# Run inside the Postgres container when there is one, for the same
# reason docker/pg-backup/backup.sh does: pg_dump refuses to talk to a
# newer server, and the version on a developer's machine is whatever
# Homebrew last installed. Falling back to a local pg_dump keeps the
# script usable against a database that is not in Docker.
CONTAINER="$(docker ps --filter ancestor=postgres:16-alpine --format '{{.Names}}' 2>/dev/null | head -1)"

# --no-owner so the dump restores into a database owned by whoever is
# restoring it, not by the role that happened to create this one;
# --clean --if-exists so a restore replaces rather than collides.
#
# NOT --no-acl: the GRANTs to the application role are what let it read any
# table, and a restore into a NEW database — the "lost disk, new machine"
# case this script exists for — has no default privileges to give them back,
# so the application would fail with "permission denied". The role itself is
# created by db/init/000_roles.sh on every fresh instance, so the GRANTs
# find it.
if [ -n "$CONTAINER" ]; then
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
    pg_dump --no-owner --clean --if-exists \
    -U "$USER" -d "$DB" | gzip > "$DEST.tmp"
else
  pg_dump --no-owner --clean --if-exists "$DATABASE_URL" | gzip > "$DEST.tmp"
fi
mv "$DEST.tmp" "$DEST"

echo "wrote $DEST ($(du -h "$DEST" | cut -f1))"
echo
echo "restore with:"
echo "  gunzip -c '$DEST' | psql \"\$DATABASE_URL\""
echo
echo "This file is gitignored and lives on this machine only. Copy it"
echo "somewhere else if it is meant to survive this machine."
