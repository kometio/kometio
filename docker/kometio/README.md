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
  -p 4200:80 -p 3000:3000 -p 4322:4322 \
  -v kometio-data:/data \
  ghcr.io/kometio/kometio:main
```

The first run downloads the image (about 185 MB). After that it is ready about
ten seconds after you press Enter.

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

| To…                     | Run                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Stop it                 | `docker stop kometio`                                                                      |
| Start it again          | `docker start kometio` (ready in a few seconds; nothing is lost)                           |
| Read its log            | `docker logs kometio`                                                                      |
| Update to a newer image | `docker pull ghcr.io/kometio/kometio:main`, then `docker rm -f kometio`, then step 1 again |
| Delete everything, anew | `docker rm -f kometio && docker volume rm kometio-data`                                    |

Removing the container (`docker rm`) keeps your site: it lives in the volume
`kometio-data`. **Removing the volume deletes the site, its pages, its
uploaded files and its accounts, for good.** There is no undo.

## Use other ports

If a port is taken, change the left side of each `-p` and say the same three
addresses to Kometio, all together — the browser checks that the editor, the
API and the site agree about where they are, and if one of them is wrong the
editor loads and every call fails without saying why:

```sh
docker run -d --name kometio --restart unless-stopped \
  -p 8200:80 -p 8000:3000 -p 8322:4322 \
  -e EDITOR_APP_URL=http://localhost:8200 \
  -e API_PUBLIC_URL=http://localhost:8000/api \
  -e PUBLIC_SITE_URL=http://localhost:8322 \
  -v kometio-data:/data \
  ghcr.io/kometio/kometio:main
```

Changing them later is a restart of the container, not a new image.

## On a server, with your own domain

Give the image a name and it serves the site over HTTPS, with certificates it
gets and renews by itself (Let's Encrypt, through Caddy, which is in the image):

```sh
docker run -d --name kometio --restart unless-stopped \
  -p 80:80 -p 443:443 -p 443:443/udp \
  -e DOMAIN=example.com \
  -e ACME_EMAIL=you@example.com \
  -v kometio-data:/data \
  ghcr.io/kometio/kometio:main
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
  in [Use other ports](#use-other-ports).
- If a browser warns about the certificate, the name's DNS does not point at this
  machine yet. `docker logs kometio` shows Caddy's attempts, and it keeps trying.

## Move a site to another installation

One file carries a site — its pages and their history, forms, categories,
settings, accounts and uploaded files — from one installation to another: from
your machine to a server, from a server to another, or as a backup you can open
anywhere. It is made by the running server and opened into a new one.

**Export**, from the container that has the site (it keeps running; the database
is read in one consistent snapshot):

```sh
docker exec kometio node /opt/kometio/cli.mjs export > kometio-site.tar.gz
```

**Import**, into a volume that has never been used, with the container _stopped_
(there is none yet, on a new machine). The address it will be reached at is the
same you would give to `docker run`: `DOMAIN`, or the three addresses, or nothing
for `localhost`:

```sh
docker run --rm -i -v kometio-data:/data \
  -e DOMAIN=example.com \
  ghcr.io/kometio/kometio:main import < kometio-site.tar.gz
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
  nothing but its manifest, its database and its uploads, as plain files.
- It needs room for the archive, unpacked, next to the data.

## With a database of your own

Give the image a `POSTGRES_HOST` and it runs no Postgres of its own: it uses that
one, and everything else is as above. The database has to hold, before the image
starts, a role called `kometio_app` — a login role that is not a superuser, so
that row level security applies to it — made the way
[`db/init/000_roles.sh`](../../db/init/000_roles.sh) makes it. Postgres 16 is what
it is tried with.

```sh
docker run -d --name kometio --restart unless-stopped \
  -p 4200:80 -p 3000:3000 -p 4322:4322 \
  -e POSTGRES_HOST=db.example.com \
  -e POSTGRES_USER=kometio -e POSTGRES_PASSWORD=the-owners-password \
  -e POSTGRES_DB=kometio \
  -e POSTGRES_APP_PASSWORD=the-password-of-kometio_app \
  -v kometio-data:/data \
  ghcr.io/kometio/kometio:main
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
- **Without `DOMAIN` it has no HTTPS.** It is reached at `localhost`, over plain
  HTTP: right for a trial, not for a server — see
  [On a server](#on-a-server-with-your-own-domain).
- **You cannot upload a theme from the editor.** That needs a separate
  builder, which is not in this image. The built-in theme is available.
- **Export and import are commands for now.** The editor will have them (Settings
  → Export, and an import on the first-run screen); until then, see
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
reverse. If any one of
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
