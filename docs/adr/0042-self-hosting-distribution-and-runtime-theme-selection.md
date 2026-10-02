# 0042 — Self-hosting distribution and runtime theme selection

**Status**: Accepted — 2026-09-02

## Context

Kometio had no way for anyone to actually run it in production themselves:
no Dockerfile for any of the 3 apps, no production `docker-compose`, no
reverse-proxy/HTTPS config, no image publishing, no self-hosting
documentation. `apps/api/src/main.ts` still carried NestJS's default
generator comment, _"This is not a production server yet!"_, unedited
despite the app being otherwise fully built out. `apps/editor-app` — a
static SPA — had no documented way to be served in production at all.

Separately, the product owner made an explicit requirement: choosing or
customizing a site's theme should never require an external rebuild
cycle (clone the repo, edit files, redistribute an image) for the common
case — an admin should be able to pick among the themes a deployment
ships with, live, from editor-app, on an already-published site.

This second requirement runs directly into [ADR-0032](0032-one-container-per-site-deployment-unit.md)'s
decision that `KOMETIO_THEME` stays a build-time-only env var. Working
through it surfaced that ADR-0032's actual argument was against
**multi-tenancy** (one container serving several _different_ sites, each
wanting its own theme) — not against a single site's _own_ theme being
changeable without a full external rebuild. These are independent axes;
ADR-0032 only ever committed to the first. See its own 2026-09-02
amendment, and [ADR-0021](0021-site-theming-filesystem-packages-and-style-settings.md)'s,
for the detailed reasoning — this ADR only needed to build on top of
that clarification, not relitigate it.

Two theme-runtime capabilities were designed together, both discussed at
length with the product owner:

- **Runtime selection among bundled themes** (in scope, this ADR):
  every theme under `themes/*` ships in one image; a site's own
  `Site.themeName`, DB-backed, decides which one renders, resolved per
  request. No rebuild to switch.
- **Live custom-theme upload with a background build** (considered,
  deliberately deferred — see Consequences; **since built, see
  [ADR-0091](0091-a-theme-can-be-uploaded-from-the-editor.md)**): an admin uploading a zip
  through editor-app, on an already-live site, triggering a background
  `astro build` in a dedicated container and hot-swapping the result in.
  Designed in real detail (a background-job system, SSE progress, a
  staging-build-then-atomic-swap safety model — none of which have any
  existing precedent in this codebase) before being set aside: the
  person capable of authoring a real custom theme (writing Astro
  components, Zod schemas) is already capable of running `git clone` +
  `docker build` — the actual non-technical audience (an agency's own
  end client) never touches theme mechanics at all, only editor-app's
  content tools, regardless of which mechanism produced the theme they
  see. Building a live-upload system now, before any real demand for it
  exists, would mean carrying its real security surface (an
  authenticated web session becomes a documented path to arbitrary code
  execution on the host, disclaimer or not) for a benefit that mostly
  accrues to a persona who doesn't need it.

## Decision

### Container topology: three containers per site, one docker-compose stack

Not a single "monolith" container. `api`, `public-site`, and
`editor-app` (served statically by `nginx:alpine`, since it's a plain
Vite SPA build with no server of its own) each get their own
multi-stage `Dockerfile` and their own container, composed together as
one stack per site. Standard "one process per container" practice:
independent logs, independent health checks, independent restarts — a
crash in one doesn't take the others down, and `docker logs <container>`
scopes to exactly one app instead of interleaved output from three.

`apps/api`'s Nx config already defined (unused until now) the standard
`prune`/`prune-lockfile`/`copy-workspace-modules` Docker-prep targets —
its `Dockerfile`'s build stage is the first thing to actually invoke
them, producing a self-contained `dist/` with a pruned lockfile and
copied `workspace_modules/` for every `@kometio/*` dependency it needs.

### Reverse proxy: Caddy, bundled by default

Automatic HTTPS via Let's Encrypt, a few lines of `Caddyfile` instead of
nginx+certbot's extra moving parts. The deciding factor was the actual
target audience: small agencies self-hosting Kometio for clients, not a
dedicated ops team — Caddy removes an entire category of setup
(certificate issuance and renewal) that a non-devops user would
otherwise have to learn from scratch. Documented as swappable for
anyone who already runs their own reverse proxy.

### Distribution: published images, not build-from-source

The three images are built in CI and published to `ghcr.io` on release,
pinned by tag. A self-hoster runs `docker pull` + `docker-compose up` —
no local clone, no local build toolchain, no waiting on a build. This
specifically became possible once live custom-theme upload (above) was
set aside: with only bundled, versioned themes to account for, one
canonical `public-site` image serves every deployment, the same way any
other self-hosted product's image does. Building your own image from
source (to bake in a custom theme, per the paragraph above) remains a
fully supported, documented path using the same Dockerfile — just not
the default one, and not something the product builds a UI for.

### `Site.themeName`: runtime theme selection among bundled themes

Every theme under `themes/*` is bundled into the `public-site` image at
build time (an optional `KOMETIO_THEME` allow-list, comma-separated, can
still subset which ones — omitted, all of them ship). A new
`Site.themeName` column (Tier 2 selection, distinct from the existing
Tier 1 `theme*` style-override columns) is read per request to decide
which theme's blocks, layout, tokens, and icons a given site's requests
render — the same site-by-domain resolution already used for page
serving, extended with one more field. Every one of the nine
`~theme`-resolving modules in `apps/public-site` (block overrides, page
blocks, layout override, icons, style-defaults, base/foreground tokens,
`BlockRenderer.astro`'s dispatch table, `PageLayout.astro`) moves from a
single process-lifetime singleton to a per-theme-keyed, per-theme-
memoized map — the same dynamic-component-by-lookup pattern already
proven in this exact codebase (`BlockRenderer.astro`'s existing
`const Component = entry?.component`), not a new one. Changed via the
editor-app UI (a new "Theme" selector in the existing Style dialog),
gated to admins, following the exact `updateThemeSettings` read/write
path this codebase already has for other per-site settings.

### Postgres backup: a `pg_dump` sidecar

A small container running `pg_dump` on a schedule (`postgres:16-alpine`'s
own bundled binary, no new adapter), writing timestamped dumps to a
named volume. Restoring from it, and pointing an external tool
(rclone/restic) at that volume for offsite/S3 copies, is documented as
an explicit runbook in `docs/self-hosting.md` — not just "back up," but
the actual restore steps, since a backup nobody has practiced restoring
from isn't a real safety net.

## Consequences

- Adding a genuinely new, not-yet-bundled theme, or a live-uploaded
  custom one, still means a rebuild — this ADR only makes switching
  among an _already-bundled_ set instant. Anyone building a custom theme
  today does so the same way they'd build any of this software from
  source: clone, add a `themes/<name>/` directory (untracked, no fork to
  keep in sync — `docker build`'s `COPY` reads whatever is on disk at
  build time, not what's committed upstream), build, deploy once. The
  end client of that deployment never sees any of this — only
  editor-app's content tools.
- Live custom-theme upload with a background build is explicitly
  deferred, not abandoned: the design (background-job table, a
  dedicated builder container, staged-build-then-atomic-swap, SSE
  progress via NestJS's native `@Sse()`) exists in full in the
  session's own implementation plan, ready to build if a real request
  for it — an actual user, or e.g. investor due diligence asking for it
  by name — materializes. Building it speculatively now would mean
  carrying real new attack surface (arbitrary code execution reachable
  from an authenticated admin session, not just from server access) for
  a persona (a non-technical end client) that, per the reasoning above,
  never actually needs it.
- `LICENSE` (FSL-1.1-ALv2) was added to the repo in the same branch as
  this ADR's implementation — unrelated to the technical decisions
  above, but relevant context: published images under a source-available
  license (not a registry-native concern, since `ghcr.io` doesn't care,
  but worth knowing for anyone auditing what "self-hosting distribution"
  actually ships).
- Migrations run via a dedicated one-shot `migrate` service in
  `docker-compose.prod.yml`, gating `api`'s startup
  (`depends_on: condition: service_completed_successfully`) — explicit,
  no self-migration-on-boot race to reason about.
- `editor-app`'s `VITE_API_URL`/`VITE_PUBLIC_SITE_URL` are Vite
  compile-time envs, baked into its static build. Changing a
  deployment's domain after initial setup means rebuilding that one
  image (`docker-compose build editor-app`) — accepted as a documented
  operational step for what should be a rare event, rather than adding
  a runtime-config-injection mechanism for it.
  **Superseded by [ADR-0076](0076-the-editor-reads-its-addresses-at-start-up.md)**:
  the two addresses are read at container start, so changing a domain is a
  restart. What forced the change was this ADR's own premise — published
  images are the distribution path, and an image built with one domain in
  it cannot be the image anybody else pulls.
