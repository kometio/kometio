# 0107 — The database's socket is for root and `postgres`

**Status**: Accepted — 2026-10-11

## Context

The image's own Postgres (ADR-0101) is made with `--auth-local=trust`: on its
Unix socket, whoever connects is whoever they say they are. The socket lives in
`/run/postgresql`, which was `0755`, and the socket file itself was `0777`
(Postgres's default). Every user in the container could open it and name the
cluster's superuser, `kometio`, with no password. The user the public site runs
as, which also runs the code of a theme, was one of them.

It was found on 2026-10-11, reviewing the image before the announcement, and
reproduced on `0.1.0-beta.1`:
`docker exec -u kometio-site … psql -h /run/postgresql -U kometio` answered as a
superuser. It contradicted what the Dockerfile and the launcher said (one user
per half, so that the site cannot reach what is not its own; the administrator's
credentials out of the API's reach), and `check.sh` looked only at the
launcher's control socket.

What it was worth: a way to run code in the site's process (a flaw in a
dependency, or a hostile theme once themes can be uploaded) was the whole
database: every row with row level security out of the way, a session for an
administrator, and `COPY … FROM PROGRAM` as `postgres`. Over TCP the same user
is refused, which is why nobody saw it: that path asks for a password.

## Decision

- **The socket is opened to its owner, `postgres`, and to root, and to nobody
  else**: the server starts with `unix_socket_permissions=0700`. It is a start
  option and not a line in `pg_hba.conf`, so it holds for a volume that was made
  before this, with no step to migrate it.
- **What has to be the administrator over the socket runs as `postgres` or as
  root.** The launcher is root: `psql`, `pg_dump`, `pg_isready` keep working.
  The migrator used to run as `kometio`, the API's user; it runs as `postgres`
  now when the database is the image's own. With a database elsewhere it goes
  over the network, as before, as `kometio`.
- **`check.sh` says it**: root opens the socket; the site's user and the API's
  are told "permission denied"; the administrator's role has no way in over TCP
  without a password.

Chosen over: a password for the administrator on the socket (`scram-sha-256`
for `local`), which needs a new secret handed to every tool that connects and a
rewrite of `pg_hba.conf` on volumes that already exist, for the same result;
and a group for the API (`unix_socket_group`, `0770`), which keeps the
administrator one step from the half that faces the internet.

## Consequences

- The API and the site have no path to the administrator's role. The API reaches
  the database over TCP as `kometio_app`, with its password, and is subject to
  row level security.
- Root opens the socket by its capabilities, those Docker gives a container by
  default. A deployment that takes them away from root (`--cap-drop ALL`) is not
  one the image has been tried in.
- **Not covered by this:** an archive that is imported runs its SQL as the
  administrator (ADR-0105); what that SQL may do is a separate question.
