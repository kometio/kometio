# 0108 — An archive is trusted like an installer, but not with root

**Status**: Accepted — 2026-10-11

## Context

ADR-0105 says an archive is "checked before anything is started", and the code
checked the listing of the tar: only a manifest, a database and uploads, as
files and folders. Two ways past that were found on 2026-10-11, reviewing the
image, and both were reproduced on the image of `main`:

1. **A shell as root through the SQL.** `database.sql.gz` goes to `psql`, which
   the launcher runs as root with the administrator role. `psql` is not only
   SQL: `\! command` is a shell, as whoever runs psql. A dump whose first line was
   `\! id -u > /data/postgres/who-ran-this` ran it as uid 0, and the import went
   on and succeeded. Root in the container is the secrets (`/data/state`,
   `/data/secrets`), the certificates' keys and the database.
2. **A copy of any file on the machine, published.** Busybox, which is the
   `tar` of this image, lists a hard link as a plain file followed by `->`
   and its target, and extracts it as a link to that target, an absolute path
   included, as root. The import then copies `uploads/` into the volume, and the
   copy of a link is a copy of its target: an entry `uploads/leak` pointing at
   `/data/state/secrets.json` became `/data/uploads/leak`, which the site
   serves to anyone. The listing check saw a file with an arrow in its name.

## Decision

- **The SQL runs as the database's own operating-system user, with `-X`.** The
  restore `psql` is started as `postgres` (what `COPY … FROM PROGRAM` is run as
  anyway, and what an administrator role can always make the server do), and
  without a `.psqlrc`. A `\!` in a dump is now a command run as `postgres`: it
  can read the database's files, which the SQL could already, and cannot read
  what root's directories hold.
- **A link is a link whatever its type says.** An entry in the listing with an
  arrow is refused, and after the archive is unpacked every path is looked at
  with `lstat`: only files that are their own (link count 1) and folders. A
  listing is text, and a parser of it can be wrong in a way an archive can use;
  the second look does not depend on it.
- **The listing is read in full:** the buffer for `tar tv` is 256 MiB, where
  the default 1 MiB made a site with more than some eight thousand files fail
  as "not a .tar.gz".
- **`check.sh` says both**: an archive whose SQL runs `id -u` is opened and the
  uid it wrote is the database's, not 0; an archive with a hard link to a file of
  the volume is refused, and no copy of the file is among the uploads.

Chosen over: **scanning the dump for lines that start with a backslash.** A
dump has `COPY` data whose lines may start with `\N` or `\\`, and a scanner has
to know where data starts and ends, which depends on the lexer of psql (quotes,
comments, dollar-quoting). A line scanner that is wrong about one of them lets
`\!` through after an error that comes too late, so it would be a check that
looks safe and is not. **Changing the dump to the custom format** and restoring
it with `pg_restore`, which has no meta-commands, was left out: it changes the
format of an archive (ADR-0105 version 1), and what the SQL in it does is the
same. **Restoring with a role that is not a superuser** was left out: the dump
makes extensions and row level security policies and grants, which need one.

## Consequences

- An archive from somebody you do not trust can still do everything the
  database's administrator can: put an account in the site with a password it
  chose, rewrite the pages, and run commands as `postgres`. **Open only archives
  that you trust, as you would an installer.** The README says so.
- It cannot make the installation run something as root, or publish a file that
  is not its own.
- Not covered: the size of an archive and of what it unpacks to (there is no
  limit, and an unpack needs room on the volume); a dump that fills the disk.
