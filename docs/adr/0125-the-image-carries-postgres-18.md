# 0125 — The image carries Postgres 18, and a volume of another major is refused with what to do

**Status**: Accepted — 2026-10-13. Does what
[0077](0077-node-24-and-pnpm-without-corepack.md) left "to be done deliberately",
for [0101](0101-kometio-is-also-one-image.md)'s image and for the compose files.

## Context

Everything that runs Postgres in this repository said 16: the single image (an
Alpine package, `postgresql16`), both compose files, CI's service, and the script
that dumps a developer's database. 16 is supported until November 2028, so
nothing is wrong with it; the reason to move is the moment. **One image has been
published, no site is live, and the one database that matters (the documentation
site's) is a dump away.** A major version does not open the files of another, so
the day there are volumes in other people's hands this stops being a choice of
version and becomes a procedure every one of them has to follow. It has never been
cheaper than now.

ADR-0077 recorded it as to be done "deliberately, with a dump-and-restore
procedure that is written down and tested, and the CI service moved in step".

## Decision

- **The image carries `postgresql18`** (18.6 on Alpine 3.24). Nothing else in its
  construction changes.
- **A volume made by another major is refused, before anything is started, with
  what to do.** `prepareCluster` compares the volume's `PG_VERSION` with the
  binary's own (`postgres --version`, so the one place that names a version is the
  package). Older volume: the message names both versions and says to export with
  the version that made it and open the export into a new volume. Newer volume:
  start the version that made it. Both say that the volume has not been changed.
  Without it the server stops with "database files are incompatible with server",
  after the volume has been looked at and saying nothing of what to do.
- **The way across is the site's own export.** It is SQL (ADR-0105), and SQL goes
  forward: `export` with the old image, `import` with the new one into a new volume.
  Nothing new had to be written for it; the README's "Update to a newer version"
  says when it applies.
- **The compose files move to `postgres:18-alpine` and to a volume of their own**
  (`postgres18-data`). The 18 image keeps its data in `/var/lib/postgresql/18/docker`
  and declares `/var/lib/postgresql` as its volume, so the mount `…/data` of the
  16 image is no longer where the data goes; and a new name leaves the 16's volume
  as it was, the way back, instead of putting a second cluster beside the first in
  the same volume.
- **`check.sh --upgrade-from` follows the major.** When the two images carry
  different Postgres majors it checks the refusal (exit 1, the message, no banner,
  the volume's `PG_VERSION` as it was), opens the old image's export into a new
  volume and checks the site from there (page, file, password, migrations); when
  they carry the same one it does what it did, on the same volume.

## What was weighed

- **`pg_upgrade` in the image** (both versions' binaries, the launcher upgrading a
  volume on its own start). It would make the update seamless, at the cost of
  roughly a second set of Postgres binaries in an image that is 725 MB, and of a
  launcher that rewrites a volume's files in place, which is the one thing it has
  been careful not to do. With no volume but the developer's in existence it
  buys nothing today. The refusal above is the hook it would hang on if the day
  comes.
- **Staying on 16** until 2028. Free now and dearer later, for the reason above.
- **17.** The same procedure for a version that is one major behind on the day it
  is made.

## What was proved

On this branch, with the real thing and not by reading:

- `check.sh --smoke-only --upgrade-from ghcr.io/kometio/kometio:0.1.0-beta.1`
  against an image built here: the beta's site (a page, a file, an account) is
  refused by this image with the message, left as it was, exported by the beta
  and opened by this image; 133 checks.
- The same with the old image being this one: the plain update, on the same volume.
- A development database (`docker-compose.yml`, migrated and seeded on 16) dumped
  with `tools/dump-database.sh`, the stack moved to the new file, and the dump
  restored into the 18: tables, migrations and the application role intact. The
  fallback for a dump that was not made first (the old volume served by a 16 for
  the length of the dump) also.
- The production compose file's procedure (`docs/self-hosting.md`): a 16 stack
  with a table, its "before upgrade" dump, `down`, the new file, `up postgres`,
  the restore of "Restoring from a backup", the rows there, and the backup service
  (now 18, with `pg_dump` of its own major) writing a complete dump.

- The whole test suite (53 projects, the integration specs of every Postgres
  adapter and the API's included) against a scratch 18 with the repository's
  migrations: one failure, below, and none after it.

## What it found

- **18 reports a row that is still referenced, under `ON DELETE RESTRICT`, with
  SQLSTATE `23001` (restrict_violation); 16 said `23503`.** The page repository
  turned `23503` on the parent-page constraints into `PageGroupHasChildrenError`,
  so on 18 deleting a page that has subpages, past the use case's own check,
  would have been a 500. `isForeignKeyViolation` accepts both, with a spec; it is
  the only place that reads a SQLSTATE of that class. The suite found it, which
  is the reason the suite was run on 18 before the CI service was moved.
- **`tools/dump-database.sh` looked for the container by image**
  (`ancestor=postgres:16-alpine`), which is the one thing that stops being true
  when the image changes, at the moment a dump is wanted. It asks compose for the
  `postgres` service now.
- **The 18 image's mount point** (above): a compose file that only bumped the tag
  would have run, and kept its data in an anonymous volume that
  `docker compose down -v` does not reach.
- **Dependabot's note** said what a Postgres bump needs; it now says where it was
  done.

## Not in this change

- **The `v0.1.0-beta.2` tag.** This is what it would carry; publishing is a
  decision of its own.
- **The developer's own database** (`kometio-postgres-1`, 16): it is not touched.
  `docs/development.md` says how to move it, dump first.
- **A guard in the other direction for an image that does not have this change.**
  `0.1.0-beta.1` on a volume made by 18 is stopped by Postgres's own message, and
  that cannot be improved from here.

## Consequences

- Everything published from here on carries 18; a site made by the beta is moved by
  an export, once.
- The next major repeats this: a package name, a volume name, the refusal already
  covers the volumes, and `check.sh` picks the branch to run by itself.
- A dump made by an 18 does not restore into a 16 (its `pg_dump` writes
  `SET transaction_timeout`, and a 16 answers "unrecognized configuration
  parameter"; tried), which is the same sentence as "going back is the export made
  before" in the README.
