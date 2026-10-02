# 0032 — One container per site is the deployment unit; `KOMETIO_THEME` stays build-time

**Status**: Accepted — 2026-08-30. Still holds, with one amendment: the
site id is no longer something `apps/editor-app` carries from build time.
`DEFAULT_SITE_ID` remains the way to pin which site a deployment edits when
its tenant owns several — the topology this ADR describes — but it is now
optional and read server-side only, see
[ADR-0044](0044-runtime-site-resolution-in-the-editor.md).

**And one supersession, which the title above no longer reflects:
`KOMETIO_THEME` is not build-time any more.** A site's own `Site.themeName`
decides which bundled theme renders, resolved per request and changeable
from the editor without a rebuild — see
[ADR-0042](0042-self-hosting-distribution-and-runtime-theme-selection.md),
which found that this ADR's real argument was against **multi-tenancy**
(one container serving several different sites, each wanting its own
theme) and never against a single site changing its own theme. The
deployment-topology decision below still holds; the theming half does
not. `KOMETIO_THEME` survives only as an optional allow-list narrowing
which bundled themes a deployment offers.

## Context

`KOMETIO_THEME` (`apps/public-site/astro.config.mjs`) resolves which filesystem theme package a build uses at **build time**, never per-request — Tier 2 of docs/adr/0021's theming model. This was flagged in a security/architecture review as worth double-checking against the actual business model: if a single running container were ever meant to serve several sites under one account, each potentially wanting its own theme, a build-time-only `KOMETIO_THEME` would silently force all of them onto the same one.

That question can't be answered by looking at the theming code alone — it depends on what "one deployment" is actually supposed to serve, which turned out to already be answered elsewhere, just never connected to this specific question:

- [ADR-0006](0006-temporary-fixed-tenant-resolution-pre-auth.md): a fresh deployment seeds exactly **one** tenant + **one** site (`DEFAULT_TENANT_ID`/`DEFAULT_SITE_ID`), read from env vars.
- [ADR-0010](0010-session-based-auth-foundations.md), directly: _"this is safe only because Kometio is single-tenant per deployment (self-hosted, not a multi-tenant hosted offering)"_ and _"[`DEFAULT_TENANT_ID`'s narrower job is to] supply a tenant before a session exists in a single-tenant deployment."_
- In the running code today: there is no `POST /sites` endpoint, no site-switcher UI in editor-app, and no way to create a second site under the same tenant at all. `sites` is plural in the schema for RLS/tenant-isolation hygiene (every table being `tenant_id`/`site_id`-scoped from day one, "even if today it's always the same value" per ADR-0006), not because multi-site-per-tenant is a live product feature.

So the model was already decided twice, just never stated in terms of _deployment topology_ — this ADR is that missing statement, not a new decision.

## Decision

**The deployment unit is one container per site.** A client (or an agency's own client) who needs a second site gets a second deployment — its own container, its own `DEFAULT_TENANT_ID`/`DEFAULT_SITE_ID`/`KOMETIO_THEME`, pointed at either its own database or a shared one scoped by tenant. Nothing about this requires the same database to be off-limits; it's specifically the _serving container_ that stays one-per-site.

`KOMETIO_THEME` resolved at build time (Tier 2, docs/adr/0021) is correct as-is under this model and needs no change: a container never needs to pick a theme per request because it never serves more than one site's worth of requests to begin with.

> **Superseded — see the amendment at the top of this file.** The paragraph above is kept as written because it is the reasoning ADR-0042 had to work through, not because it still describes the system. Theme selection is per site and per request today.

No code changes follow from this ADR. It exists to close the open question left in the 2026-08-24/25 security/architecture review's "database residual" notes, and to give future-you (or whoever reads `astro.config.mjs`'s `KOMETIO_THEME` comment) the actual reasoning instead of a re-litigation.

## Consequences

- `sites` staying schema-plural is deliberate defense-in-depth (RLS/tenant-scoping hygiene), not a half-built feature — don't read its plurality as a signal that multi-site-per-container is coming.
- If a real use case for one container serving multiple differently-themed sites under one account ever shows up, that's a new decision, not a reason to reopen this one on spec: it would need a real `POST /sites` + site-switcher UI + per-request theme resolution (a genuinely bigger feature, not a config tweak) and should be scoped against an actual request, not a hypothetical.
- Local dev is unaffected either way: `DEFAULT_SITE_ID` in `.env` already models exactly one site per running instance, matching this ADR by construction.

## Amendment — 2026-09-02: runtime theme selection does not reopen multi-tenancy

[ADR-0042](0042-self-hosting-distribution-and-runtime-theme-selection.md)
introduces two new theme-runtime capabilities: an admin picking among the
themes bundled into a running container's own image with no rebuild
(`Site.themeName`, resolved per-request), and (documented, deliberately
deferred until real demand — see ADR-0042's own Consequences) uploading a
custom theme that would trigger a background build inside that site's
own stack. Worth being explicit about what this does and doesn't change
against this ADR's own decision, since on a skim it could look like the
exact thing this ADR argued against.

This ADR's decision was against **multi-tenancy** — one container serving
several _different_ sites, each wanting its own theme, which this ADR's
Consequences section explicitly left as a future decision to scope
against a real request, not something to build speculatively. Nothing
about that has changed: a container in this deployment model still
serves exactly one site, forever, for the lifetime of that deployment.
There is still no `POST /sites`, no site-switcher, and no per-request
"which site" resolution beyond what already existed for domain-based
page serving.

What ADR-0042 adds is narrower: that _one_ site's _own_ theme becoming
changeable at runtime, among a bundled set. The per-request resolution
ADR-0042 requires is "which theme does the one site this container
serves currently have," not "which site is this container serving" —
the latter is what this ADR's argument against multi-tenancy was
actually about, and it remains unanswered by design, not by oversight.

This also updates a stale assumption baked into `astro.config.mjs`'s own
comment at the time of this ADR (now corrected in the same change as
ADR-0042's implementation): it read "a container never needs to pick a
theme per request," citing this ADR. That specific claim no longer holds
— the _site_ per container is still fixed, but the _theme_ that site's
own container serves is no longer decided once at build time. The two
are independent axes; this ADR only ever committed to the first.
