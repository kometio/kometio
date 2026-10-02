# 0029 — Sibling-scoped page slug uniqueness, WordPress-style

**Status**: Accepted — 2026-08-28

## Context

When page hierarchy (`parentId`) was introduced, slug uniqueness stayed
global per `(tenantId, siteId, locale)` — a deliberate, documented
simplification at the time: `/prodotti/scarpe` and `/blog/scarpe` could
not coexist, even though WordPress (the product's own reference point for
this feature) allows exactly that. Two reasons were given for deferring
it: a composite unique constraint including a nullable `parentId` doesn't
actually enforce uniqueness among root-level pages in Postgres (`NULL <>
NULL`), and sibling-scoped uniqueness means resolving a public URL needs
segment-by-segment lookups instead of one query on the trailing slug. Both
turned out to be solvable, not blocking — this ADR is that follow-through.

## Decision

### Schema: composite unique + a partial index for the root-level gap

`pages`' unique constraint becomes `(tenantId, siteId, locale, parentId,
slug)` instead of `(tenantId, siteId, locale, slug)`. That alone doesn't
stop two root-level pages (`parentId IS NULL`) from sharing a slug —
Postgres never considers two NULLs equal — so a second, partial unique
index closes exactly that gap:

```sql
CREATE UNIQUE INDEX "pages_root_slug_unique"
  ON "pages" ("tenant_id", "site_id", "locale", "slug")
  WHERE "parent_id" IS NULL;
```

Verified live against real Postgres, not just assumed: two root pages
sharing a slug are rejected by `pages_root_slug_unique`; two pages sharing
a slug under two different non-null parents are both accepted.

### Resolution: walk the path top-down, not the trailing slug alone

A new `PageRepositoryPort.findByParentAndSlug(tenantId, siteId, locale,
parentId, slug)` replaces `findBySlug` everywhere — the old signature
couldn't express "scoped to this parent" at all. `resolvePageByPath`
(`libs/application`) walks a URL's segments root-to-leaf, one
`findByParentAndSlug` call per segment, and — since it visits every
ancestor along the way — collects the ancestor chain in the same pass
instead of a separate upward walk. `getPublishedPageBySlug` (public,
unauthenticated) and `apps/public-site`'s `[locale]/[...slug].astro` (and
`[locale]/index.astro`'s "home" lookup) both moved from a single
trailing-slug query to this walk.

The wire contract changed with it: `GET /public/pages/by-slug`'s query
param is now `path` (a `/`-joined string, e.g. `servizi/idraulica`), not
`slug` — a single segment is a special case of a path, not the other way
around.

**Consequence accepted deliberately**: the old "found the right page via
a wrong intermediate path segment, then 301-redirect to the canonical
one" mechanism is gone. It depended on trailing-slug lookup being
unambiguous — once the same slug text can legitimately exist under
different parents, guessing "this trailing slug's owner is definitely the
page you meant" is no longer safe; a wrong leading segment might silently
land on a completely different page that happens to share the final slug.
A URL with the wrong ancestor segments now simply 404s, like any other
not-found path, rather than being corrected.

### Every write path scoped to the real parent, including one that never checked at all

`createPage`, `duplicatePage` (inherits the source's `parentId`), and
`createPageTranslation` (resolves the translated parent first, then
checks against _that_) all pass the real `parentId` into their
pre-insert uniqueness check instead of a parent-agnostic one.
`setPageParent` — reparenting a page never changes its `slug`, so under
the old global uniqueness a move could never violate it — gained a check
it never needed before: moving a page under a parent that already has a
different child with the same slug now correctly rejects with
`PageSlugAlreadyExistsError`, where before it would have silently
succeeded and then collided with the new composite constraint (or, worse,
with neither constraint if the colliding sibling were also at the target
parent's DIFFERENT existing slug — this is the gap that made the check
necessary, not optional).

### The untranslated-page fallback becomes path-based too

`resolveUntranslatedPageFallback` (ADR from 2026-08-28's earlier
fallback fix, same day) tried "same slug in another locale" as its
heuristic. Under sibling-scoped uniqueness that heuristic is ambiguous on
its own — two different pages in two different branches can share a
trailing slug — so it now tries the same _full path_, not just the
trailing segment, reusing `resolvePageByPath` for the lookup.

## Consequences

- `libs/ports`' `PageRepositoryPort.findBySlug` is gone, replaced by
  `findByParentAndSlug` — every caller (`create-page`, `duplicate-page`,
  `create-page-translation`, `get-page-by-slug`, `get-published-page-by-slug`,
  `resolve-untranslated-page-fallback`, the in-memory test fixture, the
  Drizzle adapter) updated in the same change.
- `GET /pages/by-slug` (the authenticated admin read path) gained an
  optional `parentId` query param for the same reason — it has no known
  caller in `apps/editor-app` today, but the port method it depended on no
  longer exists in the old shape, so it had to move too.
- A page's canonical URL is still computed the same way
  (`localePathFromAncestors`) — only how a page is _found_ from an
  incoming URL changed, not how its own URL is built.
- Two pages under different parents sharing a slug is a new, correct
  capability — verified with a dedicated repository-level test (`save()`
  allows the same slug for two pages under DIFFERENT parents) alongside
  the existing collision tests (root-level collision, same-parent
  collision), and an application-level test proving a path with the wrong
  leading segment does NOT accidentally match the other branch's page.
- Verified live against the running dev API, not just the test suite: the
  old `slug` query param now 400s (the new schema has no such field), a
  multi-segment `path` resolves correctly, and an uppercase segment is
  rejected by the same slugify-derived validation a single slug always
  had.
