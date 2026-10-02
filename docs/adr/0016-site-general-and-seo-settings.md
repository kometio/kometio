# 0016 — Site general settings and search engine indexing control

**Status**: Accepted — 2026-08-19

## Context

Two related gaps surfaced while wiring up the SEO rendering work from
ADR-0014: a site's `domain` and `name` had no admin UI or API to change
them after the initial seed (`db:seed` hardcodes `domain: 'localhost'` for
local dev; a real deployment had no way to set its actual domain short of
a direct SQL edit) — meaning no real site could actually launch through the
product. Separately, the user asked for a WordPress-style "discourage
search engines from indexing this site" control: the ability to keep a
site under construction out of Google until its owner deliberately decides
it's ready, mirroring `wp_options.blog_public`.

## Decision

### General settings (name, domain) as their own dialog, same pattern as business info

A new `PATCH /sites/:id/general-settings` endpoint and
`GeneralSettingsDialog`, mirroring `BusinessInfoDialog`/`updateBusinessInfo`
exactly (ADR-0014's per-page-SEO-panel precedent, applied at the site
level here). Kept separate from the SEO settings dialog below rather than
one combined "site settings" dialog — the user asked for these as two
distinct sections, and they're two different concerns (routing identity
vs. crawler behavior) that happen to both live on `Site`.

`domain` reuses the same hostname `zod` validation the public read path
already applies to an incoming `Host` header (`public-pages.schemas.ts`'s
`domainSchema`, now exported) — the site's own `domain` field must be a
plausible hostname for the identical reason.

No uniqueness constraint added on `domain` — none existed before this
change, and this product's current shape (one site per tenant in practice)
doesn't yet justify one.

### Search engine indexing: a site-level opt-in flag, defaulting to off

`sites.searchEngineIndexingEnabled: boolean not null default false`.
Defaults to `false` for every site, new or already seeded — explicitly
opt-in, not opt-out, matching the user's own framing ("I want to be the
one who decides when indexing should start"): a site mid-build
shouldn't be indexed until its owner deliberately flips it on, rather than
being indexed by default and requiring the owner to notice and turn it
off.

Enforced two ways, both driven by this one flag:

1. `PageLayout.astro` adds `<meta name="robots" content="noindex, nofollow">`
   on every page when the flag is off.
2. `robots.txt` (now a dynamic route, previously static) emits
   `User-agent: *\nDisallow: /` instead of `Allow: /` + the sitemap
   reference.

Both are advisory, not enforced — respecting either signal is up to the
crawler. Belt-and-braces rather than relying on just one: `noindex`
governs whether an already-indexed page gets removed even if something
still links to it, `robots.txt` governs whether a compliant crawler ever
fetches the page in the first place.

`sitemap.xml` generation is unaffected by this flag — it still lists every
published page regardless. A `Disallow: /` in `robots.txt` already tells a
compliant crawler not to fetch anything on the site, sitemap included, so
there is no separate case to handle there.

### Bundled into the existing sitemap-listing endpoint, not a new one

`GET /public/pages` (added for ADR-0014's sitemap work) already resolves
the site by domain to list its pages; its response grew a sibling
`searchEngineIndexingEnabled` field alongside `items` rather than adding a
second public endpoint. `apps/public-site`'s `robots.txt.ts` calls the
same `listPublishedPages()` client function `sitemap.xml.ts` already uses,
picking the field it needs off the same response.

## Consequences

- `sites` gains `search_engine_indexing_enabled` (migration `0009`, no RLS
  changes needed — existing column, same table).
- `GetPublishedPageBySlug`'s `PublishedSite` and `ListPublishedPagesForSitemap`'s
  return shape both grew this field — every caller/fixture constructing a
  `Site` or asserting on these use cases' output needed updating
  (compiler-enforced, not easy to silently miss).
- A site created before this change (or seeded fresh) starts with indexing
  _off_ — deliberate, not a migration oversight. An operator launching a
  real site must explicitly enable indexing from the new SEO settings
  dialog before search engines will be let in.
