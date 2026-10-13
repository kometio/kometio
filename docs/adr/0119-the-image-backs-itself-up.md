# 0119 — The image backs itself up

**Status**: Accepted — 2026-10-12.

## Context

The review of 2026-10-11 listed, under what wakes the owner at night, "a backup
that is silently broken, which weighs only when there is an incident", and, among
what a site owner expects of a CMS, a scheduled backup. The single image had one
way to a copy of the site: somebody running `export` by hand. Nothing made one
when nobody remembered to, and nothing said when the one that was meant to be
made was not.

## Decision

- **The launcher makes a backup of the site every `KOMETIO_BACKUP_EVERY_HOURS`
  (24 by default) and keeps the `KOMETIO_BACKUP_KEEP` newest (7)**, in
  `/data/backups`, which is root's (`0700`): an archive holds the accounts'
  password hashes. `0` switches it off; a demo makes none, being made again
  from its seed ([ADR-0118](0118-a-deployment-can-be-a-public-demo.md)).
- **It does not make an archive: it asks for one**, over the socket the editor's
  export uses ([ADR-0105](0105-a-site-archive-is-a-pg-dump-and-its-uploads.md)).
  The dump, the one-at-a-time rule that keeps two exports from running together
  or an export from running over an import, and the format are the ones that
  are already there and tried, and a backup restores with `import` like any
  archive. A refusal (busy, no site yet) is retried in half an hour.
- **A backup that is not whole is never one**: it is written to a name that is
  not a backup's and renamed when it ends, so a restore never finds half of one;
  and only files named as the server names its archives are ever listed or
  removed, whatever else somebody put in the folder.
- **A restart is not a backup**: the next one is an interval after the newest
  file's time, and the first, on a server with none, ten minutes after the start.
- **A value that is not a number stops the start**, naming the variable, like
  `DOMAIN` does: a typo that quietly switched backups off is the worst this could
  do.
- **A monitor is told**: `KOMETIO_BACKUP_PING_URL`, asked after each backup, with
  `/fail` after it when one failed (the convention of healthchecks.io). A monitor
  that is down never stops a backup, and the address, which is a secret, is not
  logged.
- **`cli.mjs backup` makes one now**, by the same code, for before an update.

## What it does not do

- **It does not protect against the loss of the machine or the volume**, since
  the folder is on it. Copying the folder elsewhere is the owner's, from the host
  (the README gives the line), and the monitor is how they learn it stopped.
  Writing to a bucket from here would put a second set of credentials in the
  image, for the part that is the most different from one installation to
  another.
- **It does not test a restore on its own schedule.** That a backup opens is
  proved on every pull request by `check.sh`, which opens one into a new volume
  and exports it again; whether a particular file on a particular disk is whole
  is what the size and the monitor say.
- **It is not a point-in-time recovery**: a backup is the site at the moment it
  was made, a day old at the worst.

## Consequences

- A person who ran `docker run` and forgot about it has seven daily copies of
  the site a command away, and an update instruction that can say "or, the last
  backup".
- The volume holds up to seven archives more: the README says so and gives the
  variable.
