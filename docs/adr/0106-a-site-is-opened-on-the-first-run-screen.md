# 0106 — A site is opened on the first-run screen, by the launcher, which stops the API to do it

**Status**: Accepted — 2026-10-05

## Context

ADR-0105 made the archive of a site and opened one into a new volume with a
command: `docker run … import`. The person who is moving a site to a server is
better served by the screen they meet first: the first-run screen, which asks
for a setup token and an administrator, could ask instead for a file.

A running server cannot just restore under itself. The database is made again
(`drop database`, then the dump), and the API and the public site hold it open and
remember, in memory, that there is no site yet. They have to stop and start again,
and only the launcher owns those processes. It also has what a restore needs and
the API deliberately does not (ADR-0101, ADR-0105).

## Decision

- **The archive is the request's body, streamed.** `POST /api/setup/import`, with
  the setup token in `X-Setup-Token` (the body is taken). The API checks the gate
  before reading one byte — the token, that there is no site yet, that a launcher
  is there — and hands the body, as it arrives, to the launcher's socket
  (`POST /import`). Nothing is kept in the API, so there is no temporary file to
  size or clean up, and an archive as big as a site is never held in memory. The
  route is throttled (five a minute) like the wizard's own, and the API's request
  timeout, five minutes by default, is raised to two hours: it is the one request
  that is as long as somebody's connection is slow. The browser sends the `File`
  itself with `XMLHttpRequest`, the only way it can say how much has gone.
- **The launcher judges the archive while it arrives, before stopping anything**
  (`readArchive`, ADR-0105): not an archive, a newer Kometio's, a link in it — a
  400 with the reason — and an installation that already has a site or an import
  already running — a 409. An answer that goes out before the body has been read
  is sent at once and the rest is read and thrown away: closing instead cuts the
  connection under a sender that is still writing, and what it sees is the broken
  pipe, not the answer (the adapter's test found it).
- **Accepted is 202, and the work comes after it.** After a second, so that the
  answer is on its way to the browser through the very process about to stop, the
  launcher stops the site and the API (on purpose: the other processes keep
  running, and the container is not restarted), restores (`restoreArchive`), runs
  the migrations, and starts the API and the site again. The migrations run
  whatever happened, because a restore that failed leaves a database that is
  empty and has no tables.
- **A failed restore puts the installation back as new.** It was new when the
  import began (that is the precondition), so dropping what the import made and
  emptying the uploads folder throws nothing away. Without it a restore that came
  through and a migration that did not, or files copied and no room for the rest,
  would be what the server starts on, and the next try would be refused as "already
  a site". It applies to the command too.
- **The outcome is told by a file.** The launcher writes `import-result.json` beside
  its socket; the API, once it is back, adds `importFailure` to `GET /setup/status`
  while there is no site. The sentence is the launcher's choice, because that
  endpoint is read by anybody who can reach the server: a refusal in its own words,
  "not enough room" for a full disk, and otherwise a sentence that points at the
  log, never a path or what Postgres said.
- **The screen waits by asking.** It polls `GET /setup/status` every second and a
  half, for up to twenty minutes. The API being away is expected and is how it tells
  the ends apart: back with a site is done (it goes to the login, which says the
  accounts came with it); back without one is a failure, with the reason if there is
  one; "no site" before the server has been seen away is the API that took the
  upload, which has not stopped yet.
- **Where it is offered.** The wizard shows the way in only where
  `GET /api/deployment` says `siteArchive`, which is the launcher being there; with a
  database of one's own there is no socket, the route answers 404, and the screen is
  only the wizard.

## Consequences

- A site moves with a click and a file: `Settings → Export` on one installation,
  the first-run screen of the next. The command remains for those who prefer it.
- While it runs the API and the site are down, and a visitor to the new server's
  address gets a 502 from the proxy where there is nothing to see yet.
- The setup token is not spent by an import, but it does not survive a failed one:
  the API starts again, as it does after any restart, and prints a new token. A
  retry that carries the old one is refused with the wizard's own sentence, which
  says to read the log again.
- An import of a site with a lot of uploads needs room for the archive, unpacked,
  next to the data, and then for the uploads copied into place.
- Not tested: an archive of many gigabytes (the 6 MB through the API is, byte for
  byte), two people racing for the same installation (the launcher does one thing
  at a time and the second is a 409, but only the unit tests have seen it), and an
  import interrupted by `docker stop`: the restore is one transaction and the
  uploads are copied after it, so what is left is a database without its files, and
  the next start sees a site and no way to open the archive again.
