# Self-hosting Kometio

This is the production deployment guide (docs/adr/0042). For local
development instead, see [docs/development.md](development.md) — this
doc assumes a real server with a real domain, not a laptop.

## Prerequisites

- A server (VPS or otherwise) with Docker and the Docker Compose plugin
  installed, reachable on ports 80/443.
- A domain you control, with three DNS `A` records already pointing at
  the server before you start: the apex domain, `admin.<domain>`, and
  `api.<domain>` (see "Why three subdomains" below). `www.<domain>` too,
  if you want `www` to work.
- A real SMTP provider (account verification and password-reset emails
  go through it — there is no Mailpit here, that's dev-only).

## Why three subdomains

Kometio ships as three separate containers — the public site, the editor
(`admin.`), and the API (`api.`) — each gets its own subdomain so Caddy
can route to the right one and issue each its own certificate
automatically. If you'd rather use a single domain with path-based
routing, or you already have your own reverse proxy, you can replace
`Caddyfile`/drop the `caddy` service — see its own comment.

If you do, set `EDITOR_APP_URL`, `API_PUBLIC_URL` and `PUBLIC_SITE_URL` in
your `.env` (they are commented out in `.env.prod.example`, and default to
`https://` on the three subdomains). All three, together: a browser origin
is scheme+host+port, and three separate things pin the editor's — the API's
CORS allow-list, `public-site`'s `frame-ancestors` for the canvas iframe,
and the addresses the editor itself calls. If one disagrees, the editor
loads normally and every API call fails CORS, with nothing on screen
explaining it.

Count your proxies too. The API trusts `TRUSTED_PROXY_HOPS` of them
(`1`, Caddy, in `docker-compose.prod.yml`) to tell it who the visitor is;
every limit per visitor — five logins a minute, forms, AI generation —
keys on that. Your own proxy in place of Caddy: keep `1`. Another proxy or
a CDN in front of Caddy: `2`. Too low, and every visitor looks like your
proxy, so one of them can lock everyone out of logging in; too high, and a
visitor can choose their own address with an `X-Forwarded-For` header.

Changing any of them afterwards is a restart, not a rebuild: the editor
reads its two addresses when its container starts (ADR-0076). After
`docker compose up -d editor-app`, a reload of the browser tab is enough —
`/config.js` is served with `Cache-Control: no-store` precisely so the new
address arrives without a hard refresh.

## First-time setup

1. Clone this repository (or download a release) onto the server.
2. `cp .env.prod.example .env` and fill in every empty value — see that
   file's own comments:
   - `PREVIEW_TOKEN_SECRET` and `PUBLIC_API_SERVICE_TOKEN`:
     `openssl rand -hex 32` each;
   - `POSTGRES_PASSWORD` and `POSTGRES_APP_PASSWORD`: at least 16
     characters (`openssl rand -hex 24`);
   - `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`: your site's own, from
     the Cloudflare dashboard (Turnstile → Add site);
   - the `SMTP_*` values of your mail provider.

   The API refuses to start with a value left empty or too short, or with
   Cloudflare's test captcha keys (which let every captcha through), and
   says which one.

   `PUBLIC_API_SERVICE_TOKEN` is the one worth understanding rather than
   pasting. The public site renders pages on the server, so every
   visitor's page view reaches the API from one address — the public
   site's own. Without this value the API's rate limit therefore counts
   your whole site as a single client, and roughly two page views per
   second is enough to make it answer 500 to everybody at once. With it,
   the public site says whose page view each request is and the API
   counts that person. It is a shared secret because the API also answers
   on `api.` — a visitor address anyone could claim is a rate limit
   anyone could escape.

3. Build and start the database + migration step first:
   ```sh
   docker compose -f docker-compose.prod.yml up -d postgres
   docker compose -f docker-compose.prod.yml up migrate
   ```
4. Start everything else:
   ```sh
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   The first run builds all three app images locally (a few minutes);
   `--build` isn't needed on later restarts.
5. Read the **setup token** the API printed when it started:
   ```sh
   docker compose -f docker-compose.prod.yml logs api | grep -A4 'not been set up'
   ```
   It gates the wizard, so that nobody who happens to reach your server
   before you can create themselves the administrator account. Treat it as
   a password. It is regenerated every time the API restarts, and only the
   most recent one works.
6. Once DNS has propagated, open `https://admin.<domain>`. A deployment
   nobody has set up yet opens on the **first-run wizard** rather than a
   login screen: paste the token, then give it your site's name, its
   default language, and the email and password for your administrator
   account. You are logged in as soon as it finishes.

That is the whole setup. There is no seed step, no admin password and no
site id in your `.env` — the wizard runs once per installation and refuses
to run again afterwards, so there is nothing to clean up either.

Your new site comes with one published home page carrying the name you
typed, so it renders as soon as it is reachable rather than answering 404
on itself. Edit it, or replace it, from **Pages**.

One thing is still yours to do: the site has no domain attached yet, which
is deliberate — the wizard runs before anyone can know the public hostname,
and it may not even resolve at that point. Set it in **Site settings** in
the editor. Until you do, the public site has no site to match a request
against and every URL 404s.

### If you would rather not use the wizard

The two seed scripts still exist, for development and for anyone
automating a deployment:

```sh
docker compose -f docker-compose.prod.yml run --rm migrate \
  pnpm --filter @kometio/postgres-db exec tsx scripts/seed-default-tenant.ts
docker compose -f docker-compose.prod.yml run --rm migrate \
  pnpm --filter @kometio/postgres-db exec tsx scripts/seed-default-user.ts
```

They need `DEFAULT_TENANT_ID`, `DEFAULT_SITE_ID`, `DEFAULT_USER_EMAIL` and
`DEFAULT_USER_PASSWORD` set (generate the two ids with `uuidgen`). Be aware
of what that costs: the admin password sits in plaintext in a file on the
server, and stays there. Change it through "Forgot password?" afterwards if
you go this route.

`DEFAULT_SITE_ID` has one other use, unrelated to seeding: it pins which
site a deployment edits when its tenant owns more than one
([ADR-0032](adr/0032-one-container-per-site-deployment-unit.md)). Leave it
unset otherwise — the API then resolves the tenant's only site on its own,
which is what lets a wizard-created install need no site id anywhere
([ADR-0044](adr/0044-runtime-site-resolution-in-the-editor.md)).

## Choosing a theme

Every bundled theme (`themes/classic`, `themes/docs-showcase`, ...) ships
in the `public-site` image by default — pick which one your site actually
uses live, from editor-app's Style dialog ("Tema"), no rebuild needed.
See [docs/adr/0042](adr/0042-self-hosting-distribution-and-runtime-theme-selection.md).

`KOMETIO_THEME` in `.env` is a separate, optional knob: a comma-separated
allow-list (`KOMETIO_THEME=classic`) restricting which of the bundled
themes this deployment will serve at all — what an agency sets so its
client can only ever pick the agency's own theme. Both sides apply it
(ADR-0069): the public site refuses to render anything outside the list,
and the editor's theme picker does not offer it. Leave it unset to keep
every bundled theme selectable. It's read at runtime, so changing it
needs a restart, not a rebuild:

```sh
docker compose -f docker-compose.prod.yml up -d public-site
```

## Backups

The `postgres-backup` service dumps the whole database on a schedule
(`BACKUP_INTERVAL_SECONDS` in `.env`, default daily) into the
`postgres-backups` named volume, pruning anything older than
`BACKUP_RETENTION_DAYS` (default 14). List what's there:

```sh
docker compose -f docker-compose.prod.yml exec postgres-backup ls -la /backups
```

For offsite/S3 copies, point an existing backup tool (rclone, restic —
don't reinvent one) at that volume; not built into this stack.

### Restoring from a backup

A backup nobody has practiced restoring from isn't a real safety net —
this is the actual procedure, not just "run pg_restore":

1. Stop the app (keep Postgres running): `docker compose -f docker-compose.prod.yml stop api public-site editor-app caddy`
2. Copy the backup file out of the volume if needed, then restore:
   ```sh
   docker compose -f docker-compose.prod.yml exec -T postgres \
     sh -c 'gunzip -c | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     < /path/to/kometio-YYYYMMDDTHHMMSSZ.sql.gz
   ```
   This restores into the _existing_ database — if you need a clean
   slate first, drop and recreate it before this step.
3. Restart everything: `docker compose -f docker-compose.prod.yml up -d`

## Upgrading

Migrations only go forward: there is no command that undoes one, so the
way back from an upgrade gone wrong is a backup taken right before it.
The scheduled one can be a day old; take a fresh one first:

```sh
docker compose -f docker-compose.prod.yml exec postgres-backup sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
   | gzip > "/backups/kometio-before-upgrade-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"'
```

It lands next to the scheduled ones and is pruned with them after
`BACKUP_RETENTION_DAYS`. Then upgrade:

```sh
git pull
docker compose -f docker-compose.prod.yml up -d --build migrate  # runs and exits
docker compose -f docker-compose.prod.yml up -d --build
```

## Uploaded themes

An admin can upload a theme from the editor (Style → Theme → "Upload a
theme"). The `theme-builder` service builds the site with it and the
public site switches to the new build without a restart; nobody touches
Docker for it. What to know as the person running the stack
([ADR-0091](adr/0091-a-theme-can-be-uploaded-from-the-editor.md)):

- It all lives in the `theme-data` volume: the uploads, the themes built
  so far, and the builds. Back it up with the rest if you rely on uploaded
  themes; a restore without it falls back to Kometio's own themes.
- A theme's components run on the public site's server. That is why only
  admins can upload, and why the public site gets only the variables it
  reads rather than your whole `.env`.
- Two services do the work. `theme-runner` builds the site with the theme,
  isolated (no network, no volume but its exchange directory, read-only,
  unprivileged, restarted clean after each build); `theme-builder` never
  runs theme code, and is the one that publishes the result.
- **To turn uploads off**, remove the `theme-builder` and `theme-runner`
  services and the `THEME_DATA_DIR` line from the `api` service. The editor stops offering
  the upload; the site keeps serving the last build it had.
- The builder is the same Kometio version as the rest of the stack: after an
  upgrade, a build made by the old one is refused by the new public site,
  which serves its own themes until the next upload is built.

## Generating pages with AI

An admin connects a site to a language model in **Integrations → Generating
pages with AI**: Claude with an API key, or any server that speaks the OpenAI
API — including one on your own machine, such as Ollama. From then on anyone
who edits pages can use **Generate with AI** in the editor. The key is typed
into the editor, not into `.env`, and the provider is paid by whoever owns the
key. What to know as the person running the stack:

- The API key is stored **sealed** (AES-256-GCM), never in the clear, and
  the editor only ever shows its last four characters.
- The key that seals it is generated on first start in the `secrets` volume
  (`KOMETIO_SECRETS_DIR`). It is kept apart from the database on purpose: a
  database backup alone opens nothing. **Back up the `secrets` volume
  separately** if you want restored sites to keep their AI keys; without it
  a restore works, and an admin types the API key in again.
- To manage the key yourself instead, set `KOMETIO_SECRETS_KEY` to 32 random
  bytes in base64 (`openssl rand -base64 32`); it wins over the generated
  one. Keep it as safe as the rest of `.env`.
- **To turn page generation off** (a public demo, say), remove the
  `KOMETIO_SECRETS_DIR` line from the `api` service. The editor stops offering
  it.
- The API calls the provider itself: for Claude, `api.anthropic.com` has to
  be reachable from the `api` container; for an OpenAI-compatible server, the
  address the admin typed.
- **A model server inside your network is refused by default**: this
  machine, a private range (`10.x`, `192.168.x`, `172.16–31.x`), cloud
  metadata. Otherwise whoever is admin of a site could make the API call
  services that were never meant to be reachable, such as the database. The
  check is made on the address actually connected to, and redirects are not
  followed. To use a model on your own machine (Ollama, LM Studio), allow it
  in `.env` — only if every admin of every site here is someone you trust:

  ```sh
  KOMETIO_AI_ALLOW_PRIVATE_HOSTS=true
  ```

  The address is then **as seen from inside the container**: `localhost`
  there is the container itself. For a server on the host machine use
  `http://host.docker.internal:11434/v1`; Docker Desktop resolves it on its
  own, while on Linux add this to the `api` service in
  `docker-compose.prod.yml`:

  ```yaml
  extra_hosts:
    - 'host.docker.internal:host-gateway'
  ```

- What a generation may cost is bounded: 10 requests a minute per client,
  at most 2 pages being written at once per site, 4 minutes each, 16,000
  output tokens with Claude, no automatic retries, and a request the editor
  abandons is cancelled at the provider.

## Custom themes

Adding a theme Kometio doesn't ship — an agency's own, for a specific
client — is an upload (above) or, to pin it into images, a build of your
own on Kometio's builder image: see [creating-a-theme.md](creating-a-theme.md),
"Shipping it", and [themes/README.md](../themes/README.md) for the
theme-authoring convention.
