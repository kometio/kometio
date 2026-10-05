# 0105 — A site archive is a pg_dump and its uploads

**Status**: Accepted — 2026-10-05

## Context

A site has to be able to leave one installation for another: from a laptop to a
server, between servers, and as a backup that opens anywhere. The plan asked for
`export` / `import` of one file (database, uploads, a manifest). The sidecar of the
compose stack dumps the database on a schedule, which is the operator's disaster
recovery; it does not carry the uploads and is not a way to move a site.

The choices, with the reasons they went as they did:

- **A dump, not a logical archive.** The file holds a `pg_dump` of the database and
  the uploads as they are on disk. The alternative, an archive made by walking the
  application's entities (24 tables, in two directions, with ids, versions and row
  level security) would survive schema changes and could be shared with the
  WordPress importer, and would take four to six days. A dump follows the migrations
  by itself and loses nothing. Its cost: it needs the same schema lineage, and it is
  not an interchange format.
- **Hashes travel, secrets and moments do not.** The accounts come with their
  password hashes, so a person signs in on the new installation with the password
  they had. Not in the file: sessions and the links in flight (the rows of
  `sessions`, `verification_tokens`), the submissions of the forms
  (`form_submissions`), the state of imports (`import_jobs`), and the key that seals
  the AI provider's API key, which lives in the server's own volume. The sealed key
  stays in the database, useless without that key, and is cleared on import; the
  provider and model are kept and the key is asked for again. The structure of those
  tables travels, their rows do not: `pg_dump --exclude-table-data`.
- **Only into a new installation.** An import makes the database again under a
  volume nobody is using, so it will not run over a site, over uploaded files, or
  over a volume that has a Postgres running on it. Nothing here is deleted to make
  room.

## Decision

- **The archive** is one `.tar.gz`: `manifest.json` (format and its version, when
  it was made, the site's name, domain and languages, the migrations applied by
  name, the uploads' count and size, and what did not travel), `database.sql.gz`
  and `uploads/`. The migrations are named by the journal of the code that made
  the archive: drizzle records them by the time of the journal's entry, and the
  journal is what says which is which (`appliedMigrationTags`).
- **Trust is decided before anything is touched** (`readArchive`, with `archive.mjs`
  and its tests): it must be a `.tar.gz` that holds nothing but the three entries,
  as plain files and folders. A link inside `uploads/` would point anywhere on the
  machine and be served as a file of the site; a name with `..` would leave the
  folder it is opened into. Its manifest must be this format's, and its migrations a
  start of the ones the running code has, in order: an archive of an older Kometio
  opens (the migrations it lacks run after the restore), one of a newer one is
  refused and says to update the image.
- **Import** (`restoreArchive`) makes the database again from the dump in one
  transaction (a failure leaves nothing), runs the migrations, gives the site the
  domain of the address this installation is reached at (the same `DOMAIN` or three
  addresses the server would be started with), forgets the sealed AI key, and copies
  the uploads in.
- **Export** works on a running server: `pg_dump` reads one snapshot. The uploads are
  read where they are, so a file added during the export may or may not be in it.
- **Where it runs: in the image, as a command.** `docker exec kometio node
/opt/kometio/cli.mjs export` on a running server, and `docker run … import` on a
  volume nobody uses (`export` also works as `docker run … export` on a stopped
  one). It needs a privileged hand: the API does not have the database
  administrator's credentials (ADR-0101), `kometio_app` is under row level security,
  and a restore needs a superuser. The commands run as the container's root, the
  way the launcher does, and share the launcher's own helpers
  (`processes.mjs`, `embedded-postgres.mjs`). The editor's menu (export) and the
  first-run screen's import come next, on a helper in the launcher that the API
  reaches through a socket only its user can open; they are the same two operations.
- **A volume another container has open is refused.** `postmaster.pid` is how a
  second `docker run` on the same volume can tell: a pid file written by a process
  in another container names a process this one cannot see, so Postgres takes it for
  stale, deletes it and starts a second server on the same files. This was done once,
  by mistake, while this was being written, and the first server's lock file was
  gone; it is the reason for the check, and for the test of it.

## Consequences

- A site can be moved with two commands and a file, and the plan's example of the
  docs site's move to the server is one.
- The compose stack's operators dump with `pg_dump` and copy their uploads volume;
  this archive is not made for them, and its commands are the image's.
- Not tested: an archive of an older Kometio, because there is no older one yet to
  make it. What decides whether it opens (the migrations are a start of this
  version's, in order) is unit-tested; the migrations it lacks would run after the
  restore as they run on any database at start. Also not tested: an archive of many
  gigabytes. A plain-SQL dump has no architecture, and `check.sh` runs the whole move
  on the image CI publishes, on both.
- A site archive carries the whole site, drafts included: it is as sensitive as the
  database.
