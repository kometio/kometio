# Run Kometio with one Docker command

One command starts all of Kometio — the editor, the public site, the API and
its database — in a single container, and keeps everything you create in a
single volume. In about two minutes you have a site you can edit in the
browser.

Use it to try Kometio, to build a theme against it, or to see it before you
propose it to a client. On your own machine it is a trial setup;
[On a server, with your own domain](#on-a-server-with-your-own-domain) is the
same image with HTTPS, and
[What this image does not do yet](#what-this-image-does-not-do-yet) says where
the line is. [docs/self-hosting.md](../../docs/self-hosting.md) is the guide
for the version with a database of its own.

**You need:** Docker (Docker Desktop, or Docker Engine), and ports `4200`,
`3000` and `4322` free on your machine. If they are not,
[use other ports](#use-other-ports).

## 1. Start it

```sh
docker run -d --name kometio --restart unless-stopped \
  --stop-timeout 30 --log-opt max-size=10m --log-opt max-file=5 \
  -p 4200:80 -p 3000:3000 -p 4322:4322 \
  -v kometio-data:/data \
  ghcr.io/kometio/kometio:0.1.0-beta.1
```

The first run downloads the image (about 200 MB). After that it is ready about
ten seconds after you press Enter.

The two options on the second line are not decoration:

- **`--stop-timeout 30`**: `docker stop` waits ten seconds by default and then
  kills the container. The database needs a few seconds to stop cleanly, and a kill
  is a crash that it recovers from at the next start. Thirty is what Kometio itself
  allows each of its parts.
- **`--log-opt max-size=10m --log-opt max-file=5`**: Docker keeps the log of a
  container without limit unless told, and this one writes to it for as long as it
  runs (and, with no mail server, the links of invitations and password resets go
  there). This keeps the last 50 MB and nothing more.

It holds between 75 and 200 MiB of memory when it is idle (measured; more while
it resizes an image or makes an archive) and about 700 MB of disk for the image, plus the volume with
your site. A machine with 1 GB of memory is where we would start.

This is a trial, for the machine it runs on: the three ports are published on
every address of the machine, and the server runs as `development`, with the
example secrets it generates for itself. On a machine that other people can
reach, publish them on `127.0.0.1` only (`-p 127.0.0.1:4200:80` and so on), or
make it a server with a name, [below](#on-a-server-with-your-own-domain).

`0.1.0-beta.1` is the first beta, the one this page was tried on. Every version
has its own tag, listed [with the other tags](https://github.com/kometio/kometio/tags),
and a version's image is made once, when it is released. `:main` is different: it
moves with every change that is merged, newer and tried only by our own tests. Use
it to follow the work, not for a site you care about.

There is no `:latest`, on purpose: your site is in the volume, and a version's
migrations only go forward. A tag that moves would update a site on a
`docker pull`, with no way back, so a version is always named.

Prefer a file? [`compose.yaml`](compose.yaml) in this folder is the same thing:
`docker compose -f docker/kometio/compose.yaml up -d`.

## 2. Read the setup token

```sh
docker logs kometio
```

The end of the log looks like this:

```
────────────────────────────────────────────────────────────────
  Kometio is ready

  Editor      http://localhost:4200
  Your site   http://localhost:4322

  First time here? Open the editor and enter this setup token:

      <a long random string>

────────────────────────────────────────────────────────────────
```

The token proves that you are the person running this server, so nobody else
who finds the address can claim the installation before you. It changes every
time the container starts, and it only appears until the first administrator
exists. (With the compose file, the command is `docker compose -f
docker/kometio/compose.yaml logs kometio`.)

If the log does not end with "Kometio is ready" yet, wait a few seconds and
run it again.

## 3. Create your account

Open <http://localhost:4200>. The first time, it asks for:

- the **setup token** from step 2;
- a **site name** and the site's **default language**;
- the site's **domain**, already filled in with `localhost`, the address this
  installation serves: leave it as it is. Kometio finds your site by that name,
  so it has to be the one visitors type; you can change it later in
  **Settings → General**;
- your **email** and a **password** (at least 12 characters: this account
  cannot be unlocked by anyone else).

Press **Create my account**. You land on the list of pages, with a home page
already published.

## What you should see

- Open <http://localhost:4322>. It goes to your site's home page in the
  language you chose, titled with your site's name.
- In the editor, **Pages** lists that home page as _Published_. Open it, edit
  it on the canvas, publish, and reload the site.

## Everyday commands

| To…                       | Run                                                              |
| ------------------------- | ---------------------------------------------------------------- |
| Stop it                   | `docker stop kometio`                                            |
| Start it again            | `docker start kometio` (ready in a few seconds; nothing is lost) |
| Read its log              | `docker logs kometio`                                            |
| Update to a newer version | [below](#update-to-a-newer-version)                              |
| Delete everything, anew   | `docker rm -f kometio && docker volume rm kometio-data`          |

Removing the container (`docker rm`) keeps your site: it lives in the volume
`kometio-data`. **Removing the volume deletes the site, its pages, its
uploaded files and its accounts, for good.** There is no undo.

### Update to a newer version

A new version opens the volume of the old one and brings its database up to date
at the start; there is no going back from that (the migrations only go forward).
So, in this order:

```sh
# 1. a copy of the site first, which any version can be started from
docker exec kometio node /opt/kometio/cli.mjs export > before-the-update.tar.gz

# 2. the new image, then stop the old container (it is given thirty seconds)
docker pull ghcr.io/kometio/kometio:<the new version>
docker stop -t 30 kometio && docker rm kometio

# 3. step 1 again, with the new version's tag and the same volume
```

Do not use `docker rm -f` for this: it kills the database instead of stopping it.

**When the new version carries a newer Postgres.** A major version of Postgres
does not open the files of another. `0.1.0-beta.1` carries Postgres 16 and the
versions after it carry 18, so a volume made by the first is not opened by the
others: the image stops at the start, says so, and leaves the volume as it was.
For that update, steps 1 and 2 are the same, and step 3 opens the export into a
**new** volume instead of starting on the old one (with the `-e DOMAIN=…`, or the
three addresses, that you give `docker run`):

```sh
docker run --rm -i -v kometio-data-18:/data \
  ghcr.io/kometio/kometio:<the new version> import < before-the-update.tar.gz
# then start the new version as in step 1, with -v kometio-data-18:/data
```

The old volume, `kometio-data`, is not touched: remove it when you have looked at
the site. Nobody is signed in afterwards, as with any import
([Move a site](#move-a-site-to-another-installation)).

**Going back.** The migrations only go forward, so an older image does not start
on a volume a newer one has opened: it stops at the start, says that the volume was
made by a newer Kometio, and leaves it as it was. To be on the older version again,
open the export (or the backup) made before the update into a new volume with that
version's image, as in [Move a site](#move-a-site-to-another-installation).

## If it does not start

```sh
docker logs --tail 50 kometio
```

The launcher says what it was doing and why it stopped, and the last lines are
the ones to read. By what the log says:

- **`address already in use`** (from Docker, when you start it): a port is taken.
  Change the left side of each `-p`, as in [Use other ports](#use-other-ports).
- **`DOMAIN=… is …: write the name alone`**: `DOMAIN` is not a bare name. Write it
  as `example.com`: no `https://`, no port, no path.
- **`this volume was made by a newer Kometio than this image`**: a newer version
  opened this volume, and migrations only go forward. Start the version that made
  it, or a newer one, and do not remove the volume. To be on the older version,
  open the export or backup made before the update into a new volume
  ([Going back](#update-to-a-newer-version)).
- **`this volume's database was made by PostgreSQL 16, and this image carries 18`**:
  a major version of Postgres does not read the files of another, and the volume
  was made by the older. It is as it was. Start the version that made it, export
  the site, and open the export into a new volume with this image
  ([When the new version carries a newer Postgres](#update-to-a-newer-version)).
  The same message the other way round (`… is newer than the 18 this image
carries`) means the volume was made by a newer version: start that one.
- **`migrate failed (exit 1)`, with lines from `[migrate]` above it**: a migration
  could not be applied. They run in one transaction, so the database is as it was.
  Give the lines above it to whoever helps you, and start the previous version on
  the same volume.
- **`No space left on device`**: the disk is full, and the database cannot write.
  Free room on the machine (`docker system df` shows what Docker holds), then
  start it again; nothing is lost. The daily backups are in `/data/backups`,
  seven kept.
- **`Invalid or missing environment variables:` and a list**: a setting is missing
  or wrong, and the list names it. Fix that variable and start again.
- **`… did not come up within …s`**: a part did not answer in time. On a machine
  with little memory the first start is slow, and a full disk or a swapping
  machine does the same. Read the lines above it for the part's own message, and
  give the machine at least 1 GB.
- **`… stopped on its own (…): stopping everything`**: a part died, and the
  launcher stops the rest so that Docker starts it clean. The part's own lines
  are just above. If it starts and stops again (`docker ps` shows it restarting,
  with `--restart unless-stopped`), do not remove the volume: everything is in it.
- **`this volume is in use by a running Kometio, or was left by one that was not
stopped cleanly`** (from `docker run … export` or `import`): another container
  has the volume, or a stop was cut short. Stop that container
  (`docker stop -t 30`); if it was left by a crash, start it and stop it once,
  cleanly.

If none of these is it, give the log to whoever helps you, and use the file from
`export` (or the newest in `/data/backups`) to start a new installation if you
need one: [Move a site](#move-a-site-to-another-installation).

## Use other ports

If a port is taken, change the left side of each `-p` and say the same three
addresses to Kometio, all together — the browser checks that the editor, the
API and the site agree about where they are, and if one of them is wrong the
editor loads and every call fails without saying why:

```sh
docker run -d --name kometio --restart unless-stopped \
  --stop-timeout 30 --log-opt max-size=10m --log-opt max-file=5 \
  -p 8200:80 -p 8000:3000 -p 8322:4322 \
  -e EDITOR_APP_URL=http://localhost:8200 \
  -e API_PUBLIC_URL=http://localhost:8000/api \
  -e PUBLIC_SITE_URL=http://localhost:8322 \
  -v kometio-data:/data \
  ghcr.io/kometio/kometio:0.1.0-beta.1
```

Changing them later is a restart of the container, not a new image.

## On a server, with your own domain

Give the image a name and it serves the site over HTTPS, with certificates it
gets and renews by itself (Let's Encrypt, through Caddy, which is in the image):

```sh
docker run -d --name kometio --restart unless-stopped \
  --stop-timeout 30 --log-opt max-size=10m --log-opt max-file=5 \
  -p 80:80 -p 443:443 -p 443:443/udp \
  -e DOMAIN=example.com \
  -e ACME_EMAIL=you@example.com \
  -v kometio-data:/data \
  ghcr.io/kometio/kometio:0.1.0-beta.1
```

Before you run it, the DNS of the name has to point at the server — the
certificates are issued only for names that do. Two records are enough, an `A`
for the name itself and an `A` for `*` (a wildcard), both with the server's
address; or four, one each for `example.com`, `www`, `admin` and `api`. Your
site is then at `https://example.com`, the editor at `https://admin.example.com`
and the API at `https://api.example.com`. Everything else is as above: read the
setup token from `docker logs kometio`, open the editor, create your account.

- **`DOMAIN`** is the name alone, like `example.com` — no `https://`, no port, no
  path. Anything else is refused at start with a message that says what to write.
- **`ACME_EMAIL`** is optional: the address Let's Encrypt writes to when a
  certificate is about to expire and could not be renewed.
- **Ports 80 and 443** are what the server publishes, and the only ones. The
  three halves of Kometio are inside the container, and nothing reaches them but
  the proxy. Port 80 is needed too: it answers Let's Encrypt's check, and sends a
  browser that comes by plain HTTP to HTTPS. (`-p 443:443/udp` is for HTTP/3;
  leave it out if you like.)
- **The certificates live in the volume**, with everything else, so a restart does
  not ask Let's Encrypt again: it limits how often it will issue for one name.
- A server runs as `production`: the login cookie is `Secure`, and the container
  refuses to start on example secrets or on Cloudflare's test captcha keys. Behind
  a proxy of your own instead, leave `DOMAIN` out and set the three addresses as
  in [Use other ports](#use-other-ports), with `https://` in them: an address that
  is `https` makes it run as `production` too. It does **not** make it trust your
  proxy's `X-Forwarded-For`, because that is right only when nothing but your
  proxy can reach the three ports, and the container cannot know that. If that is
  so (publish the ports on `127.0.0.1` or an internal network only), add
  `-e TRUSTED_PROXY_HOPS=1`, or `2` with a CDN in front of your proxy: without it
  every visitor looks like your proxy, and one person can use up the login's five
  tries a minute for everybody. If the ports can be reached directly, leave it
  unset: anyone could then write the header themselves, and every try would count
  as another visitor. The log says so at the start.
- If a browser warns about the certificate, the name's DNS does not point at this
  machine yet. `docker logs kometio` shows Caddy's attempts, and it keeps trying.
- **Pictures are resized once, and kept.** The site makes each size of each
  picture the first time it is asked for and keeps it on disk, up to 256 MB
  (`-e IMAGE_CACHE_MAX_MB=…`; `0` keeps none; what goes over the limit is what
  was asked for longest ago). Resizing is what costs a server the most — on two
  CPUs, some forty times a page — and it was done again for every visitor whose
  browser had not seen the picture. The cache is in the container's own
  filesystem, not the volume: a new container makes them again, and nothing is
  lost.
- **A disk that is nearly full stops taking uploads, so that the database can go on
  writing.** The uploaded files are on the same volume as the database, and a
  library that fills it is a site that cannot save a page. An upload that would
  leave less than 1 GB free is refused, and the editor says the server is short of
  room (`-e MEDIA_MIN_FREE_MB=…` changes the 1024; `0` turns the check off).
- **Invitations and generated pages have a limit for each person**, not only for
  each address: an administrator may send twenty invitations an hour (a re-sent
  one counts), and a person may generate fifty pages a day. The counts are kept in
  memory, and start again when the server does.

## The log

`docker logs kometio` is all of it: one stream, each line behind the name of the
part that wrote it (`[kometio]` is the launcher, then `[postgres]`, `[api]`,
`[site]`, `[editor]`, and `[caddy]` on a server).

**It grows until you say where it stops.** Docker's default keeps every line for
as long as the container exists. Give it a limit when you create it:

```sh
docker run … --log-opt max-size=10m --log-opt max-file=5 … ghcr.io/kometio/kometio:0.1.0-beta.1
```

(`docker-compose.prod.yml` already does, for each of its services.)

**For a log collector, as JSON.** With `-e KOMETIO_LOG_FORMAT=json` every line the
container writes is one JSON object, so that a collector (Loki, Datadog, a
`jq` pipe) never meets a line it cannot read, and tells the parts apart by
`service`:

```json
{"service":"api","level":"log","pid":41,"timestamp":1791881127287,"message":"Nest application successfully started","context":"NestApplication"}
{"service":"postgres","level":"log","timestamp":1791881127301,"stream":"stderr","message":"2026-10-13 08:52:56.805 UTC [21] LOG:  database system is ready to accept connections"}
```

What a part writes as JSON itself (the API's, Caddy's) is kept as it is, with
`service` added; what it writes as text (Postgres, nginx, the launcher's lines)
is wrapped. The banner, with the setup token, is still there, one line at a time.
The commands (`export`, `import`, `backup`) are always text: a person reads
those.

**One line for each request**, with `-e KOMETIO_ACCESS_LOG=true`. The API writes
one: method, path (never the query), status, time, the request id the response
carries and who was signed in; not the health check, which Docker asks every ten
seconds. On a server with a `DOMAIN`, the proxy writes one too, for every request
to the site, the editor and the API: time, method, host, path (never the query),
status, size and duration, and **nothing a request carries**: no cookie, no
header of any kind, no address, no browser. A line of the proxy's is a JSON
object (`"logger":"http.log.access…"`) in the text log too, as the proxy writes
it. If you need the address of a client, for an abuse report, put a proxy of
your own in front: this is the one that is shipped. It is off because it is the
most frequent line there is; on a busy site it is the one that makes a rotating
log forget an hour ago.

## Move a site to another installation

One file carries a site — its pages and their history, forms, categories,
settings, accounts and uploaded files — from one installation to another: from
your machine to a server, from a server to another, or as a backup you can open
anywhere. It is made by the running server and opened into a new one.

**Export**, from the container that has the site (it keeps running; the database
is read in one consistent snapshot). In the editor, an administrator finds it in
**Settings → Export**: one button, and the file is downloaded by the browser. From a
terminal:

```sh
docker exec kometio node /opt/kometio/cli.mjs export > kometio-site.tar.gz
```

**Import, on the first-run screen.** Start a new installation as in step 1, read
the setup token from its log, and open the editor: under the form there is **I
already have a site from another installation**. Give it the token and the file, and
the server opens the site — it stops its API and its site, restores, and starts them
again, which takes a minute or more while the page waits — and sends you to the
login, where the account you had signs in. The container is not restarted. If it
cannot (not enough room on the volume, an archive of a newer Kometio), the page says
so and the installation is as it was; the API prints a new token when it starts again.
A proxy of your own in front of the server that limits the size of a request
(Cloudflare's free plan: 100 MB) limits the archive too: for a bigger one, use the
command below.

**Import, with a command**, into a volume that has never been used, with the container
_stopped_ (there is none yet, on a new machine). The address it will be reached at is
the same you would give to `docker run`: `DOMAIN`, or the three addresses, or nothing
for `localhost`:

```sh
docker run --rm -i -v kometio-data:/data \
  -e DOMAIN=example.com \
  ghcr.io/kometio/kometio:0.1.0-beta.1 import < kometio-site.tar.gz
```

Then start Kometio on that volume as in step 1. There is no setup token and no
wizard: the site is there, and you sign in with the account you had.

What you should know:

- **The file is a secret.** It holds the accounts' password hashes and every page,
  draft and form. Keep it the way you keep a password; the export says so.
- **Nobody is signed in, and no link works.** Sessions, and the links in flight (a
  password reset, an invitation, an address confirmation), do not travel; an
  invitation still waiting is sent again from the Users screen. **Form submissions
  do not travel** either: a copy of a site does not start with somebody else's
  messages.
- **The site takes the new address.** Its domain becomes the host of the address
  the new installation is reached at, not the one it had.
- **The AI provider's key does not travel.** It is sealed with a key that belongs to
  the server it was made on; enter it again in Settings (the provider and the model
  are kept).
- **It opens only into a new volume.** An installation that already has a site, or
  uploaded files, refuses, and nothing is changed: the database is made again under
  an import, and nothing here is thrown away to make room. To redo one, start from a
  new volume. A volume that another container is using (or that one left without a
  clean stop) is refused too: stop it first.
- **A file from an older Kometio opens in a newer one** (the migrations it lacks run
  after it is restored); **one from a newer Kometio does not open in an older one**,
  and says so. An archive is also checked before anything is started: it must hold
  nothing but its manifest, its database and its uploads, as plain files (a link is
  refused).
- **Open only archives you trust, as you would an installer.** The database in an
  archive is SQL, and it is run as the database's administrator: it can put an
  account in the site with a password it chose, change every page, and run commands
  as the database's own user. What it cannot do is run anything as root, or publish
  a file that is not its own.
- **It needs room for the archive twice, next to the data**: as it came and
  unpacked, and 1 GB is kept for the database. A file larger than the volume can
  take is refused while it is being read, with the size it was allowed, and a file
  that declares more unpacked than there is room for (or more than 512 GB, or a
  million entries, which is not a site) is refused before anything is unpacked.
  Nothing is left on the volume.

## Run a public demo

A demo is a Kometio that anybody may try: the address and password of its
account are on a page, and strangers sign in with it
([ADR-0118](../../docs/adr/0118-a-deployment-can-be-a-public-demo.md)). Start it
with `-e KOMETIO_DEMO=true` and what a stranger can do is what a publisher can,
minus the few things that are not the demo's to give:

- **Nobody configures the site.** The account may be an admin; in a demo it is a
  publisher. Its users, settings, AI key, themes, imports and archive are out of
  reach, and the editor shows only what it can use.
- **Nothing is uploaded and the account is not changed**: no file reaches the
  disk, and the password, the address and the profile of the shared account stay
  as they are.
- **What visitors typed into the site's forms cannot be read** from the editor:
  the next person to sign in would otherwise read it.
- **No embed runs.** An `EmbedHtml` block shows a line saying so, instead of the
  pasted HTML.
- **Nothing is mailed, and nobody is added to a newsletter**, though the
  environment has a mail server or a provider: whoever signs in could make a form
  notify an address of their choosing.
- **Search engines are kept out**, whatever the site's own setting says.

What it does not do is start over: that is `demo-reset.sh`, which makes the demo
again from a **seed**, the export of a site you prepared on an installation of
your own (Settings → Export). Resetting is opening the seed into a volume that has
never been used, so what visitors did is gone and what they find is the seed.

```sh
KOMETIO_IMAGE=ghcr.io/kometio/kometio:0.1.0-beta.1 \
SEED=/srv/kometio/demo-seed.tar.gz \
DOMAIN=demo.example.com \
sh docker/kometio/demo-reset.sh -p 80:80 -p 443:443 -p 443:443/udp
```

The script removes the demo that is running before it opens the seed, and takes
a minute or two. Try a new seed once by hand before it is the one cron uses, and
put it in cron at the hour the fewest people are looking:

```cron
0 4 * * * KOMETIO_IMAGE=… SEED=… DOMAIN=… sh /srv/kometio/demo-reset.sh -p 80:80 -p 443:443
```

Two things to know before it is public. **Two visitors in the same demo see each
other's edits**: it is one site. And **the seed is a file with password hashes**:
prepare it on a site whose account is only for the demo, and give that account a
password you are happy to print.

## With a database of your own

Give the image a `POSTGRES_HOST` and it runs no Postgres of its own: it uses that
one, and everything else is as above. The database has to hold, before the image
starts, a role called `kometio_app` — a login role that is not a superuser, so
that row level security applies to it — made the way
[`db/init/000_roles.sh`](../../db/init/000_roles.sh) makes it. Postgres 18 is what
it is tried with.

```sh
docker run -d --name kometio --restart unless-stopped \
  --stop-timeout 30 --log-opt max-size=10m --log-opt max-file=5 \
  -p 4200:80 -p 3000:3000 -p 4322:4322 \
  -e POSTGRES_HOST=db.example.com \
  -e POSTGRES_USER=kometio -e POSTGRES_PASSWORD=the-owners-password \
  -e POSTGRES_DB=kometio \
  -e POSTGRES_APP_PASSWORD=the-password-of-kometio_app \
  -v kometio-data:/data \
  ghcr.io/kometio/kometio:0.1.0-beta.1
```

- **`POSTGRES_USER` and `POSTGRES_PASSWORD`** are the database's owner, used only to
  run the migrations at every start; the API and the site never see them. The API
  connects as `kometio_app`, with **`POSTGRES_APP_PASSWORD`**, which has to be the
  one that role was made with. `POSTGRES_PORT` is 5432 unless you say otherwise.
- **The site lives in that database**; `/data` keeps the uploaded files and the keys
  the launcher generated. A new container on the same database and the same volume
  is the same site, with its accounts signed in.
- **The editor offers no export, and the first-run screen no import**, and the
  `export` and `import` commands do not apply: they make and open archives with the
  tools of the image's own database. Back up a database of your own the way you
  back up any database (`pg_dump`), and copy `/data/uploads` with it.

## What this image does not do yet

Said plainly, so that you do not find out by failing:

- **It sends no email.** Invitations and password resets need a mail server,
  and a trial has none, so each of those emails is written to the container's
  log instead, link included (`docker logs kometio`). The editor says so on the
  Users screen. Give it a mail server with `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_FROM_ADDRESS` and, if the server asks for them, `SMTP_USER` and
  `SMTP_PASSWORD` (`-e SMTP_HOST=…` on the `docker run`; `.env.prod.example`
  lists the rest).
- **Its captcha is Kometio's own, and a small one.** The login and the forms of
  your site use a captcha built into Kometio, a proof of work the browser solves
  in the background: no account, no network. It is meant to keep scripts out, not
  to be the last word on abuse. To use Cloudflare Turnstile instead, give both of
  your keys, `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (`-e` on the
  `docker run`; both, or neither).
- **It reports its errors nowhere unless you say where.** With `-e SENTRY_DSN=…`
  (a Sentry project's address) the API and the public site report the errors
  nobody handled: the error, the method, the path and the request id, with no
  request body, header, cookie, query string or person (docs/adr/0114).
  `SENTRY_ENVIRONMENT` and `SENTRY_RELEASE` are optional labels. An address
  that is not a DSN stops the API at start, naming the variable.
- **Without `DOMAIN` it has no HTTPS.** It is reached at `localhost`, over plain
  HTTP: right for a trial, not for a server — see
  [On a server](#on-a-server-with-your-own-domain).
- **You cannot upload a theme from the editor.** That needs a separate
  builder, which is not in this image. The built-in theme is available.
- **A site is opened only into a new installation.** Export and import are in the
  editor (Settings → Export, and the first-run screen), and also commands; see
  [Move a site](#move-a-site-to-another-installation).

## Build the image from this repository

The image does not rebuild the apps: it assembles the three images that each
app already has, so there is one place that says how each is built. To build
all of them locally, from the repository root:

```sh
docker build -f apps/api/Dockerfile -t kometio-api:dev .
docker build -f apps/public-site/Dockerfile -t kometio-public-site:dev .
docker build -f apps/editor-app/Dockerfile -t kometio-editor-app:dev .
docker build -f docker/kometio/Dockerfile -t kometio:dev \
  --build-arg API_IMAGE=kometio-api:dev \
  --build-arg PUBLIC_SITE_IMAGE=kometio-public-site:dev \
  --build-arg EDITOR_IMAGE=kometio-editor-app:dev .
```

Then `docker run … kometio:dev` as in step 1. Without the `--build-arg`s, the
last build takes the published images (`ghcr.io/kometio/kometio-api:main` and
its two siblings) instead.

## How it is put together

`launcher.mjs` starts, in order, Postgres, the migrations, the API, the public
site, the editor's web server and, when `DOMAIN` is set, Caddy, and stops them in
reverse. (Beside them it answers the API, on a socket only the API's user can open,
when the editor asks for the site's archive.) If any one of
them dies it stops the rest and the container exits, so that Docker's restart
policy brings the whole thing back clean, instead of leaving half of it
running. Everything that has to survive lives under `/data`: the database, the
uploaded files, the keys the launcher generated and, on a server, Caddy's
certificates.

A database inside the container is right for a trial and for a small site you
back up. For anything you cannot afford to lose, give it
[a database of your own](#with-a-database-of-your-own), or use the compose stack in
[docs/self-hosting.md](../../docs/self-hosting.md), which keeps Postgres in a
container of its own.
