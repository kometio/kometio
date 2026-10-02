# 0044 — The editor resolves its site at runtime, not at build time

**Status**: Accepted — 2026-09-05

## Context

[ADR-0006](0006-temporary-fixed-tenant-resolution-pre-auth.md) established
that a deployment names its tenant and its site through
`DEFAULT_TENANT_ID`/`DEFAULT_SITE_ID`, and
[ADR-0032](0032-one-container-per-site-deployment-unit.md) made that the
deployment unit: one container per site. `apps/editor-app` consumed the
site half of that as `VITE_DEFAULT_SITE_ID` — a Vite variable, therefore
**baked into its JavaScript bundle when the image is built**. Thirteen
files read it at module scope.

[ADR-0042](0042-self-hosting-distribution-and-runtime-theme-selection.md)
and the first-run wizard that followed moved the _tenant_ to runtime
resolution (`DeploymentTenantResolver`: the env var when set, otherwise the
single row in `tenants`). The site was not moved with it. That asymmetry
was the whole defect, and it made the wizard non-functional for the user it
was built for.

It was found by walking `docs/self-hosting.md` literally, from four freshly
built images, as somebody who had never seen the repo. Two symptoms, one
cause:

1. **The guide's first command could not run.** `.env.prod.example` said of
   `DEFAULT_SITE_ID`: _"Leave them unset unless you are automating a
   deployment"_. `docker-compose.prod.yml` required it —
   `${DEFAULT_SITE_ID:?…}` — to build `editor-app`. Compose interpolates
   the whole file even when a single service is named, so
   `docker compose up -d postgres` failed before anything started.

2. **Nothing a self-hoster could put there would have worked anyway.** The
   wizard creates the site with `randomUUID()`, server-side, after the
   image was built. Measured against the running stack:

   ```
   GET /sites/00000000-0000-4000-8000-000000000000   -> 404 Site not found
   GET /sites/65f332c8-…  (the id the wizard created) -> 200
   ```

   The placeholder was literally present in the shipped bundle. Since
   `requireAuth` maps only 401s to a redirect, that 404 surfaced as an
   error screen: setup completed, and the editor was unusable.

A build-time constant cannot name a row created after the build. No amount
of documentation fixes that.

## Decision

**`apps/editor-app` asks the API which site it edits, at runtime.**

- `GET /sites/current` (declared above `@Get(':id')`, which would otherwise
  swallow the literal `current`) returns the deployment's site.
- `DeploymentSiteResolver` decides which that is, mirroring
  `DeploymentTenantResolver`: `DEFAULT_SITE_ID` when set — which keeps
  ADR-0032's "several sites in one database, one container each" topology
  working — otherwise the tenant's only site, failing loudly rather than
  picking one when there are several. A pinned id that matches nothing is
  an error, not a silent fallback: that is how an operator who mistypes it
  ends up editing another customer's site.
- It deliberately does **not** cache, unlike the tenant resolver. That one
  sits on the public request path where a per-render lookup would be real
  cost; this one answers one request per editor boot. Not caching removes
  the need for a `refresh()` after the wizard, and with it the whole class
  of bugs where a process keeps answering with a stale miss.
- `VITE_DEFAULT_SITE_ID` is removed from the Dockerfile, the production
  compose file, `ci.yml` and `.env.example`. `DEFAULT_SITE_ID` survives as
  an **optional server-side** variable only.
- `siteQueryOptions()` loses its parameter, and its cache key loses the id.
  That is the substantive part rather than a cosmetic one: eight mutation
  hooks write the updated record straight back into that entry, and a
  second, id-keyed entry would have been a copy that went stale after the
  first settings save.

**The wizard also seeds one published home page**, carrying the name the
admin typed, at the slug `/<locale>/` resolves to. A deployment that had
just completed setup previously served a 404 on its own homepage, with
nothing distinguishing "empty" from "broken" — `page_groups=0`,
`page_translations=0`. Its subtitle is left empty rather than given
placeholder copy: the wizard collects a locale, not a language this code
has strings for, so any sentence would be wrong in most installations while
an empty field reads as one waiting to be filled in every language.

Header and footer are **not** seeded — `GET /site-layout-sections` already
creates them on demand, and a published page renders without them.

## Consequences

- The wizard works end to end, and a self-hosted install needs no site id
  in any file.
- Changing which site a deployment edits no longer means rebuilding an
  image. The two remaining build-time browser values (`VITE_API_URL`,
  `VITE_PUBLIC_SITE_URL`) still do, so ADR-0042's "changing `DOMAIN` means
  rebuilding `editor-app`" stands — narrowed, not lifted. Moving those to a
  runtime config endpoint is the natural next step, and is deliberately not
  taken here. **Taken in
  [ADR-0076](0076-the-editor-reads-its-addresses-at-start-up.md)**: nothing
  browser-facing is baked in any more.
- One extra `await` on four loaders that need the site id to scope another
  query. Not an extra request: every screen shares the one cache entry.
- Thirteen `import.meta.env[…] as string` casts are gone, since the value
  now arrives typed from a parsed `SiteRecord`.
- ADR-0006's framing is now half-superseded: both halves of the pair it
  introduced are resolved at runtime, and both env vars are optional.
