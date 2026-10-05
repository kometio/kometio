# Run Kometio with one Docker command

One command starts all of Kometio — the editor, the public site, the API and
its database — in a single container, and keeps everything you create in a
single volume. In about two minutes you have a site you can edit in the
browser.

Use it to try Kometio, to build a theme against it, or to see it before you
propose it to a client. It is a trial setup, not a production deployment:
[What this image does not do yet](#what-this-image-does-not-do-yet) says where
the line is, and [docs/self-hosting.md](../../docs/self-hosting.md) is the
guide for a real server.

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

The first run downloads the image. After that it is ready about ten seconds
after you press Enter.

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

## What this image does not do yet

Said plainly, so that you do not find out by failing:

- **It sends no email.** Invitations and password resets need a mail server,
  and a trial has none, so each of those emails is written to the container's
  log instead, link included (`docker logs kometio`). The editor says so on the
  Users screen. Give it a mail server with `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_FROM_ADDRESS` and, if the server asks for them, `SMTP_USER` and
  `SMTP_PASSWORD` (`-e SMTP_HOST=…` on the `docker run`; `.env.prod.example`
  lists the rest).
- **Its captcha lets everybody through.** The login and the site's forms use
  Cloudflare's published test keys, which accept any answer, so that a trial
  needs no Cloudflare account. Do not put this container on the internet: your
  own keys belong to the production setup in
  [docs/self-hosting.md](../../docs/self-hosting.md).
- **It has no HTTPS and no domain of its own.** It is reached at `localhost`.
  A real domain with a certificate is the production setup in
  [docs/self-hosting.md](../../docs/self-hosting.md).
- **You cannot upload a theme from the editor.** That needs a separate
  builder, which is not in this image. The built-in theme is available.
- **There is no export or import of a site yet.** What there is, for now, is a
  copy of the whole volume. Stop the container first — copying a database while
  it runs gives a copy that may not open — then:

  ```sh
  docker stop kometio
  docker run --rm -v kometio-data:/data -v "$PWD":/backup alpine \
    tar czf /backup/kometio-data.tgz -C /data .
  docker start kometio
  ```

  To open that copy on another machine, put it back in a new volume and start
  Kometio on it as in step 1 (no setup token is asked: the account comes with
  the copy):

  ```sh
  docker volume create kometio-data
  docker run --rm -v kometio-data:/data -v "$PWD":/backup alpine \
    tar xzf /backup/kometio-data.tgz -C /data
  ```

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
site and the editor's web server, and stops them in reverse. If any one of
them dies it stops the rest and the container exits, so that Docker's restart
policy brings the whole thing back clean, instead of leaving half of it
running. Everything that has to survive lives under `/data`: the database, the
uploaded files, and the keys the launcher generated.

A database inside the container is right for a trial and for a small site you
back up. For anything you cannot afford to lose, use the compose stack in
[docs/self-hosting.md](../../docs/self-hosting.md), which keeps Postgres in a
container of its own.
