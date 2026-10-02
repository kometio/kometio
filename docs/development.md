# Local development

## Prerequisites

- Node.js 24+ (the line CI, the images and `.nvmrc` all use)
- pnpm, at the version `package.json`'s `packageManager` pins (`npm i -g pnpm@<version>`; corepack still works on Node 24 but is gone from Node 25)
- Docker (for local Postgres)

## Setup

```sh
cp .env.example .env
docker compose up -d postgres mailpit
pnpm install
```

`mailpit` is a local SMTP catcher — it receives every email Kometio sends in
dev (verification, password reset) without a real provider. Web UI at
<http://localhost:8025>.

`pnpm install` also wires up two Husky hooks:

- **pre-commit** (Husky + lint-staged): runs `eslint --fix` + `prettier
--write` on the files you staged, so a formatting-only failure in CI's
  `nx format:check` step shouldn't happen. Fast — only touches staged files.
- **pre-push**: runs the full `nx run-many -t lint` and `nx run-many -t test
--coverage` (same coverage thresholds as CI, see
  [ADR-0009](adr/0009-enforced-coverage-thresholds.md)) across the whole
  workspace, blocking the push if either fails. Slower than pre-commit by
  design — it runs once per push, not once per commit, so it's the same
  full check CI runs, just caught locally first.

Neither hook runs `build`/`typecheck` — run `nx run-many -t build typecheck`
yourself before opening a PR if you want the exact same gate CI runs end to
end.

`docker compose up -d postgres` automatically runs `db/init/000_roles.sh` (only
the first time the volume is created): it creates the `kometio_app` application
role. The schema itself (tables, RLS policies, grants) is managed by Drizzle —
see [ADR-0004](adr/0004-drizzle-as-schema-source-of-truth.md) — and applied
separately:

```sh
pnpm --filter @kometio/postgres-db run db:migrate
```

To start fresh:

```sh
docker compose down -v   # also removes the volume, the next up reruns db/init/000_roles.sh
docker compose up -d postgres
pnpm --filter @kometio/postgres-db run db:migrate
pnpm --filter @kometio/postgres-db run db:seed
```

After changing `libs/adapters/postgres-db/src/lib/schema.ts`, generate a new
migration (review the generated SQL before committing it — Drizzle can't see
RLS policies or grants, those stay hand-written in
`libs/adapters/postgres-db/drizzle/0000_baseline_schema.sql` and any future
custom migration needs the same treatment):

```sh
pnpm --filter @kometio/postgres-db run db:generate
```

A migration you need to write yourself (a data rewrite, a `USING` cast, an
RLS policy) still goes through drizzle-kit: change `schema.ts`, generate,
then edit the SQL file it wrote — or, when `schema.ts` does not change at
all, start from an empty one with
`pnpm --filter @kometio/postgres-db run db:generate --custom --name <what-it-does>`.
Writing the `.sql` by hand and adding it to `meta/_journal.json` skips the
snapshot in `drizzle/meta/`, and the next `db:generate` then emits a
migration that recreates what already exists. CI runs `db:generate` on
every PR and fails if it writes anything. A new tenant-scoped table also
needs its RLS policy in its migration, in the guarded form at the end of
`0000_baseline_schema.sql`.

Migrations only go forward. drizzle-kit has no down migrations, so there
is no command that undoes one: the way back from a migration gone wrong is
the backup taken before it ([self-hosting.md](self-hosting.md#upgrading)).
CI proves that route on every run, by dumping the migrated and seeded
database and restoring it into a fresh one.

### The 2026-09-25 squash

The 24 migrations up to `0023_import_jobs` were compacted into one
`0000_baseline_schema.sql`, checked against a database built from the 24:
the two schema dumps are identical apart from column order. A fresh
database needs nothing. A database created before that day is already in
that shape, but drizzle-kit does not know it: it decides what to run by
comparing each migration's `when` in `meta/_journal.json` with the newest
`created_at` in `drizzle.__drizzle_migrations`, and would try to run the
baseline on top of it. Tell it once, as the admin user, after a backup:

```sql
-- Only on a database that already had every migration up to 0023.
insert into drizzle.__drizzle_migrations (hash, created_at)
select 'squashed-2026-09-25', 1790258087937
where not exists (
  select 1 from drizzle.__drizzle_migrations where created_at >= 1790258087937
);
```

`1790258087937` is the baseline's `when`, the same as 0023's was. The
hash is only recorded, never compared. `db:migrate` then runs nothing,
and every migration after the baseline applies as usual.

Every self-hosted instance runs as one fixed tenant/site (see
[ADR-0006](adr/0006-temporary-fixed-tenant-resolution-pre-auth.md)). Auth
now exists (see [ADR-0010](adr/0010-session-based-auth-foundations.md)) —
there's no public registration, so seeding also creates a fixed dev/test
user (`DEFAULT_USER_EMAIL`/`DEFAULT_USER_PASSWORD` in `.env`). Seed once
per fresh database:

```sh
pnpm --filter @kometio/postgres-db run db:seed
```

## Main commands

```sh
pnpm exec nx run-many -t build typecheck test lint   # whole workspace
pnpm exec nx run-many -t test --coverage             # coverage report; enforces the
                                                      # thresholds from ADR-0009
pnpm exec nx run @kometio/api:serve                     # NestJS API in watch mode
pnpm exec nx run @kometio/editor-app:dev                 # React editor (Vite)
pnpm exec nx run @kometio/public-site:dev                 # Astro public site
```

### Before pushing

```sh
pnpm run verify
```

Runs the four gates CI runs, in one command: the tsconfig convention
check, `typecheck`, `lint`, and the test suite **with coverage**. The
`git push` hook runs the same set minus `typecheck`, which CI keeps as a
job of its own. The coverage thresholds ([ADR-0009](adr/0009-enforced-coverage-thresholds.md))
are only enforced with `--coverage`, so a run of plain `nx run-many -t
test` can be green while the push is refused. Running this first is the
difference between finding that out now and finding it out at the end of
a long session.

### End-to-end tests

`apps/e2e` drives the real editor, API and public site in Chromium with
Playwright ([ADR-0088](adr/0088-the-editor-is-tested-in-a-browser.md)).
Four groups: the main path (log in, new page, block, text edited in the
canvas, publish, the page on the site), a form end to end (conditional
field, submission, notification emails in Mailpit), the canvas (Layers
drag by mouse and keyboard, restoring a header version, a page that does
not answer and Retry), and the
accessibility gate (axe on every editor screen, both themes, 1440 and
390px wide, plus any API error a screen runs into).

Locally it uses whatever is already running on the addresses in `.env`:
the API on :3000, the editor on :4200 and the **built** public site on
:4322 (`nx run @kometio/public-site:build`, then `node
--env-file=../../.env server.mjs` from `apps/public-site`), with Postgres
and Mailpit up. Then:

```sh
pnpm --filter @kometio/e2e exec playwright install chromium   # once
pnpm exec nx run @kometio/e2e:e2e
pnpm exec nx run @kometio/e2e:e2e -- canvas                   # one file
pnpm --filter @kometio/e2e exec playwright show-report ../../dist/e2e/report
```

It runs against your own database. Every page, form and email address a
test makes is named `e2e-…` and deleted when the test ends, pass or
fail. The one thing it borrows is the header of the site's default
language: the header test puts its draft back as it found it (the
published header is never touched), but the versions it saved stay in
the header's history. Two runs of that test at once would share the one
header, so it refuses to start while the draft holds `e2e-` blocks; if a
run was cut short and left them there, restore the published version
from the header's history in the editor.

The editor speaks the language saved on the account of whoever is signed in
(English until one is chosen, [ADR-0100](adr/0100-emails-are-written-in-the-language-of-the-person.md)),
and the suite follows it: it reads that language from the API and looks for
every word of the editor through `support/editor-copy.ts`, which reads the
same files the editor does (`apps/editor-app/src/locales`). A test names a
control by the key of its text (`copy.t('canvas.publish')`), so it passes
whatever language the development account has, and a text that is renamed
or translated cannot leave a test looking for the old words. A key that does
not exist is an error in the test, not a text nobody finds. Only the sign-in
form is looked for in English: it is drawn before there is an account.

The admin logs in once, through the API, and the session is kept in
`dist/e2e/.auth/` and reused while it is valid — login allows
five attempts per account every fifteen minutes, and the main-path test
spends one of them on the login form itself.

In CI the `e2e` job builds the three apps, and Playwright starts them
from the build (`playwright.config.ts`, `webServer`). A failed run
uploads the report, with a trace of each failed test, as the `e2e-report`
artifact.

### Adding a library

```sh
pnpm exec nx g @nx/js:library <name> --directory=libs/... --importPath=@kometio/<name>
```

Then **delete `module` and `moduleResolution` from the generated
`tsconfig.lib.json` and `tsconfig.spec.json`**. The generator writes
`nodenext` into both and offers no flag to stop it, while this workspace
resolves as `bundler` (`tsconfig.base.json`) and writes relative imports
with no file extension (PR #107/#108). Under `nodenext` those imports do
not resolve, and what tsc prints is `error TS2307: Cannot find module
'./lib/whatever'` about a file sitting right there — which reads like
anything except a tsconfig problem.

`pnpm run check:tsconfig` says so in one line instead; it runs in CI and
on push, and is the first thing `pnpm run verify` does. Also compare the
generated `vitest.config.mts` against a sibling lib's: the generator
leaves out the coverage thresholds, and the `dotenv` load that the
integration specs need to reach Postgres.

After adding/moving a library or changing dependencies between projects, if Nx
reports "workspace out of sync":

```sh
pnpm exec nx sync
```

To use the canvas editor against real data, run the API and the editor
together (Postgres migrated and seeded first, see above):

```sh
pnpm exec nx run @kometio/api:serve      # http://localhost:3000/api
pnpm exec nx run @kometio/editor-app:dev  # http://localhost:4200
```

Opening `http://localhost:4200` prompts for login first (the dev user from
`db:seed` above) — every Pages route requires a session, see
[ADR-0010](adr/0010-session-based-auth-foundations.md). Once logged in, it
lands on `/pages`, the admin shell's list of pages for whichever site the
API resolves as this deployment's (`GET /sites/current`, see
[ADR-0044](adr/0044-runtime-site-resolution-in-the-editor.md)); "Nuova
pagina" creates one and opens it in the
fullscreen canvas editor at `/pages/:id`
(`apps/editor-app/src/app/canvas/canvas-editor-shell.tsx`), also requiring
`apps/public-site` to be running (see below) — the canvas embeds the real
page in an `<iframe>` and drives it via `postMessage`, it doesn't render
blocks itself in React. There is no data-format mapping layer to isolate
anymore: the canvas reads and writes Kometio's own `Block[]` directly (see
[ADR-0007](adr/0007-nested-block-content-model-independent-of-puck.md) for
why `Block[]` was designed independent of any editor library in the first
place, and [ADR-0028](adr/0028-canvas-inline-text-editing-via-tiptap-in-preview-iframe.md)
for how the iframe/`postMessage` canvas works, including inline text
editing).

**Canvas rendering needs `public-site`'s production build, not `nx run
@kometio/public-site:dev`.** Astro's dev server (v6.0+; this project is on
7.2.2) hard-blocks every subresource request whose `Sec-Fetch-Site` isn't
`same-origin`/`same-site`/`none` and whose `Origin` doesn't validate
against `security.allowedDomains`
(`node_modules/astro/dist/vite-plugin-astro-server/sec-fetch.js`). The
canvas's preview `<iframe>` is sandboxed _without_ `allow-same-origin`
(`apps/editor-app/src/app/canvas/canvas-frame.tsx`) — a deliberate fix
against stored XSS via untrusted user-inserted blocks/scripts — which
gives it an opaque origin (`Origin: null`). `new URL('null')` always
throws, so that origin can never validate against `allowedDomains` no
matter how it's configured — there is no config escape hatch for this.
The initial page navigation into the iframe still works
(`Sec-Fetch-Mode: navigate` is always allowed), but every script/CSS
module the loaded page then fetches gets a flat `403 Cross-origin request
blocked`. This is Astro's own dev-server hardening, not a bug in this
codebase.

This does **not** affect production — `server.mjs` (the real production
entrypoint, see `apps/public-site/README.md`) has no such middleware.
This is why `.env.example`'s `VITE_PUBLIC_SITE_URL` points at
`http://localhost:4322` (`PUBLIC_SITE_PORT`, also in `.env.example`), not
at `nx serve`'s `:4321` — the canvas needs the production build running
locally, always, not just as an occasional workaround:

```sh
pnpm exec nx run @kometio/public-site:build
pnpm exec nx run @kometio/public-site:start   # node server.mjs, :4322 (PUBLIC_SITE_PORT)
```

Keep that process running the same way you keep `api`/`editor-app`
running, and rebuild it after every public-site content/block change you
want reflected in the canvas — there's no live-reload here, unlike
`nx serve`. `nx serve @kometio/public-site` (`:4321`) is still the right tool any time
you're working on public-site itself without going through the canvas —
styling a block, checking content changes live. The two servers can run
side by side on their own ports. One consequence of `VITE_PUBLIC_SITE_URL`
now pointing at the production build by default: the editor's "Visualizza
pagina" link opens that same build too, so it can look stale until you
rebuild — swap the env var to `:4321` locally if you want that link to
always reflect your latest unbuilt changes instead.

The login screen's "Password dimenticata?" link leads to a password-reset
request form; the actual reset link Kometio emails opens
`http://localhost:4200/reset-password?resetToken=...`, and a verification
email opens `/verify-email?verifyToken=...`, and the link that confirms a
new sign-in address opens `/confirm-email-change?changeToken=...` — all read straight from
Mailpit at <http://localhost:8025>, there's no need for a real inbox in
dev. See
[ADR-0011](adr/0011-email-verification-password-reset.md) for the full
design (why login isn't gated on verification yet, anti-enumeration on the
reset-request endpoint, and why a password reset invalidates all of that
user's existing sessions).

To see a published page rendered on the public site, run the API and
public-site together:

```sh
pnpm exec nx run @kometio/api:serve         # http://localhost:3000/api
pnpm exec nx run @kometio/public-site:dev    # http://localhost:4321
```

`apps/public-site` calls `apps/api`'s public, unauthenticated endpoint
(`GET /public/pages/by-slug`, see `apps/api/src/app/public-pages`) — never
the authenticated CRUD one editor-app uses. It resolves which site to
render from the request's `Host` header, matched against a site's `domain`
column, so a page only ever appears at the domain it's actually configured
for. `db:seed` sets the seeded default site's domain to `localhost`
specifically so this resolves out of the box in local dev
(`http://localhost:4321/...`); a real deployment sets each site's `domain`
to what it's actually served on. `API_URL` (plain server env var, not
`VITE_`/`PUBLIC_`-prefixed — read from `process.env` at request time, not
baked in at build time, see `src/lib/public-api-client.ts`) points
public-site at the API.

A page's slug becomes its path under its locale (`/it/chi-siamo`); the bare
`/` has no page of its own and `src/pages/index.ts` redirects it to the
site's default locale (docs/adr/0017), whose root renders whichever page is
slugged `home`. Only
`status: 'published'` pages are ever reachable this way; a draft page and
a nonexistent slug both 404 identically, on purpose (see that use case's
own comments on why). Block rendering here is Astro-native (`Hero.astro`,
`Text.astro`, `BlockRenderer.astro`) and walks `Block[]`/`children`
directly — apps/public-site never depends on any editor-side library at
all (see [ADR-0007](adr/0007-nested-block-content-model-independent-of-puck.md)).

## Connecting to Postgres

Two distinct roles (see [ADR-0002](adr/0002-non-superuser-role-for-rls-enforcement.md)):

- **Admin/superuser** (`POSTGRES_USER`/`POSTGRES_PASSWORD` in `.env`): only for
  migrations and admin tasks. Always bypasses RLS.
- **`kometio_app`** (password in `POSTGRES_APP_PASSWORD`): what the backend must use
  for every runtime query. Respects the RLS policies.

To query the DB manually locally:

```sh
docker compose exec postgres psql -U kometio_app -d kometio
```

Queries run this way will see **zero rows** until you set the session tenant:

```sql
select set_config('app.current_tenant_id', '<tenant-uuid>', false);
```
