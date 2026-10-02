# 0017 — Multi-language: locale-prefixed URLs and page translations

**Status**: Partially superseded by [0034](0034-page-group-translation-shared-structure-model.md) (domain model only — URL shape and fallback config unchanged)

## Context

> **2026-09-01 note**: the `Page.groupId`/per-locale-`Page`-row domain
> model described below was replaced by `PageGroup`/`PageTranslation`
> (see ADR-0034) — this ADR's URL-shape and untranslated-fallback
> decisions are still accurate and in effect, only the storage model
> changed.

Kometio sites are self-hosted, single-tenant-per-deployment brochure/showcase
sites for Italian agencies, several of which need at least a
second language (typically English) for the same content. `Page` already
had a `groupId` column and a `(tenantId, siteId, groupId, locale)` unique
constraint reserved for exactly this — "pages that are translations of
each other share a `groupId`" — but nothing ever wrote or read it: every
page was created with a fresh, unused `groupId` and `locale` was always
whatever the (until now, hardcoded) default was. This ADR turns that
dormant column into an actual multi-language feature.

Four design questions were resolved with the user before implementation
(each against a stated alternative):

## Decision

### URL shape: every locale gets a prefix, including the default

`/it/chi-siamo`, `/en/about-us` — not "default locale unprefixed, others
prefixed" (the WordPress/Polylang-without-a-plugin default). A URL's
locale is always explicit and never inferred from "absence of a prefix",
which keeps the routing rule (and the sitemap/hreflang generation) one
uniform case instead of a default-locale special case repeated at every
call site. The cost is that every site's real homepage lives at
`/it/` rather than `/`; bare `/` becomes a redirect to
`/${site.defaultLocale}/`, resolved via `SitemapListing.defaultLocale`
(`GET /public/pages`, already used for the sitemap listing — no new
endpoint needed just for this).

### Untranslated-page fallback: configurable per site, not fixed

`sites.untranslated_page_fallback` (`'redirect-to-default' |
'not-available'`, default `'redirect-to-default'`) lets a site owner
choose what happens when a visitor requests a locale/slug combination
that has no published translation: silently redirect to the default
locale's version of the same page, or show an explicit "not available in
this language" page. Fixed to always-redirect was rejected — a site with
substantially different content per market (not just a translated
storefront) may prefer the explicit miss over silently serving the wrong
language's content.

### New translations start as a copy of the source page, not blank

`createPageTranslation` (`POST /pages/:id/translations`) copies the
source page's current draft `content` and `seoMeta` into the new
locale/slug, matching how WPML and Polylang seed a new translation. The
alternative — a blank page the editor fills in from scratch — was
rejected: for a showcase site, "translate this page" is almost always the
actual intent, and starting blank throws away the layout/block structure
the user would otherwise have to rebuild by hand before they can even
start translating text.

### Editor UX: a language switcher lives inside the page editor, not a separate screen

The page editor gets a locale selector showing the page's group siblings
(via `GET /pages/:id/translations`) plus a "create translation" action
for any of the site's `enabledLocales` not yet in the group — not a
standalone "Translations" section in the admin shell. A translation is a
property of the page being edited, not an independent entity worth its
own list view; putting the switcher where the content already is keeps
"translate this page" a one-click action from the page you're looking at.

## Domain model

- `Page.groupId` (pre-existing, now load-bearing): links every
  locale-translation of "the same page" together. `listByGroup(tenantId,
siteId, groupId)` (`PageRepositoryPort`) returns all siblings including
  the page itself.
- `Site.enabledLocales: string[]`, `Site.defaultLocale: string` — which
  locales a site offers, and which one untranslated URLs and the `/`
  redirect fall back to. `defaultLocale` must be one of `enabledLocales`
  (`localeSettingsSchema`'s cross-field `refine`, `@kometio/shared-types`).
- `Site.untranslatedPageFallback` — see above.
- `PageTranslationAlreadyExistsError` — thrown by `createPageTranslation`
  when the source page's group already has a page in the requested
  locale; distinct from `PageSlugAlreadyExistsError` (the requested slug
  is taken in that locale, independent of translations).
- The public read path (`getPublishedPageBySlug`) takes `locale` as a
  required, caller-supplied input (from the URL's locale prefix) rather
  than always resolving to the site's `defaultLocale`. A locale/slug miss
  returns `null` exactly like any other not-found slug — it does not
  search sibling locales for the same content, since a miss has no
  `groupId` to search from. `PublishedPage.translations` (populated only
  once a page IS found, via `listByGroup`, published siblings only) is
  what the language switcher on `apps/public-site` uses instead.

## Consequences

- Every existing caller/fixture constructing a `Site`, a
  `GetPublishedPageBySlugInput`, or the sitemap use case's return shape
  needed updating for the new required fields (compiler-enforced).
- `apps/public-site` still needs restructuring to locale-prefixed routes
  (`src/pages/[locale]/[slug].astro`), a `/` → `/${defaultLocale}/`
  redirect, a language-switcher component, and `hreflang` alternates in
  both `PageLayout.astro` and `sitemap.xml.ts` (grouped by `groupId`) —
  tracked as in-progress work, not yet done as of this ADR.
- `apps/editor-app` still needs the locale-settings dialog
  (`enabledLocales`/`defaultLocale`/`untranslatedPageFallback`) and the
  in-editor language switcher described above — also in-progress.
- A page created through the existing `POST /pages` endpoint still needs
  a caller-supplied `groupId` (a fresh `randomUUID()` for a page with no
  translations yet) — creating a page and creating its first translation
  are deliberately the same primitive operation from the repository's
  point of view, just with a reused vs. fresh `groupId`.
