# 0012 — Public site rendering via a dedicated unauthenticated API endpoint

**Status**: Accepted — 2026-08-18

## Context

Phase 2's public-rendering half (`piano-progetto-astro-cms.md`) was still a
static placeholder — `apps/public-site` read one hardcoded local JSON file,
no route dynamic on the actual page slug, no connection to real data.
Building it meant deciding how a publicly-reachable, unauthenticated Astro
app reads content that otherwise only exists behind `apps/api`'s session
auth — a real fork with security consequences, not a mechanical choice.

## Decision

### Public site calls a new unauthenticated API endpoint, not Postgres directly

Two options considered: (A) `apps/public-site` fetches from a new
`GET /public/pages/by-slug` endpoint on `apps/api`, server-side, at request
time; (B) `apps/public-site` connects to Postgres directly, reusing
`@kometio/postgres-page-repository`.

Chose A, confirmed with the user. Keeps `apps/api` the single boundary to
the database — consistent with Ports & Adapters everywhere else in the
project — instead of a second, publicly-exposed process holding direct DB
credentials (bigger blast radius if that process is ever compromised). The
"never leak draft content" rule then lives in exactly one reviewable place
(`get-published-page-by-slug.use-case.ts`), not wherever content happens to
be read from next.

New `PublicPagesController` (`apps/api/src/app/public-pages`), no
`SessionAuthGuard`, and deliberately no create/update/delete routes at
all — not just none exposed in a UI, structurally impossible to reach
through this controller.

### Site resolution: the request's domain, never a client-supplied ID

`sites.domain` (already in the schema, previously unused) is looked up
against the incoming request's `Host` header (`Astro.url.hostname`,
port-stripped) — never a `siteId`/`tenantId` the client could set directly,
which would let anyone query any site's content by guessing IDs. The
lookup still goes through `withTenant()` (RLS) like every other query in
the project, so even an application bug can't leak across tenants — same
"RLS as second barrier" reasoning as
[ADR-0002](0002-non-superuser-role-for-rls-enforcement.md).

The public endpoint has no session to derive a tenant from — same
bootstrap problem [ADR-0010](0010-session-based-auth-foundations.md)
solved for login. Reuses `DEFAULT_TENANT_ID` for the same reason (a
single-tenant-per-deployment instance only ever has the one tenant to
look within), but via its own provider in `public-pages.module.ts` rather
than importing `AuthModule` — that module also wires SMTP/email/session
providers this one has no business depending on just to boot.

### A draft page and a nonexistent slug get the identical 404

`getPublishedPageBySlug` only ever returns `publishedContent` for a page
whose `status` is `'published'`; anything else (draft, wrong site, no such
slug) collapses to the same `null` → 404. No oracle for probing which
draft slugs exist before they're meant to be public.

### Astro-native block rendering, not Puck's `<Render>`

[ADR-0007](0007-nested-block-content-model-independent-of-puck.md) already
decided this in principle ("any consumer of page content that isn't the
editor... can walk children directly without knowing anything about
Puck") — this is the first real consumer that needed it. Each block's Zod
prop schema (`heroPropsSchema`, `textPropsSchema`) moved out of
`@kometio/puck-config` into `@kometio/shared-types`, so `apps/public-site` can
validate against the exact same schema `apps/editor-app`'s Puck config
uses, without depending on Puck or React at all — `apps/public-site` has
zero framework dependency beyond Astro itself and `@astrojs/node`.

### Homepage: Astro's own `index.astro`, fetching the page slugged "home"

Considered: (1) a lightweight content convention — the page slugged
exactly `home` answers both `/home` and `/`; (2) an explicit field
(`isHomepage` on `Page`, or `homePageId` on `Site`) with a migration and
new editor-app UI to set it; (3) leave `/` unhandled for now.

Chose 1, confirmed with the user — explicitly framed as "don't distort
Astro's own conventions": Astro's file-based router already owns what `/`
means (`src/pages/index.astro`), so the only CMS-specific decision is
_which page's content answers it_, not how the route itself resolves.
`index.astro` and `[slug].astro` both fetch through the identical
`getPublishedPageBySlug`, just with a different slug source.

## Consequences

- `apps/public-site` ships with zero Puck/React dependency — matches the
  "near-zero client JS by default" pitch (see `docs/development.md`), not
  just on the editor's side.
- First backend surface for sites as their own concept: a new
  `libs/adapters/postgres-site-repository` package, `Site` entity in
  `libs/domain-core`, `SiteRepositoryPort` in `libs/ports`. Previously
  `siteId` only ever appeared as a foreign key, never a first-class
  read model.
- Every self-hosted instance needs a real value in `sites.domain` for
  public rendering to resolve anything there — `db:seed` sets the seeded
  default site's domain to `localhost` specifically so local dev works out
  of the box; a real deployment sets each site's `domain` to what it's
  actually served on.
- This endpoint gets its own `ThrottlerModule` instance (120 req/min,
  tuned for real page-view traffic), independent of `AuthModule`'s
  login-attempt-strictness one (5/min) — changing either limit can never
  accidentally change the other.
- SEO-specific work (meta tags beyond title/description, `sitemap.xml`, OG
  tags, `schema.org` markup) stays out of this decision's scope — already
  allocated to its own later phase (Phase 5) in the plan, confirmed with
  the user rather than folded in here.
