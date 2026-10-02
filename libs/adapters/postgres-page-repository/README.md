# postgres-page-repository

Drizzle-backed persistence for pages and their version history — implements
[`PageRepositoryPort`](../../ports/src/lib/page-repository.port.ts)
(`DrizzlePageRepository`, table `pages`) and
[`PageVersionRepositoryPort`](../../ports/src/lib/page-version-repository.port.ts)
(`DrizzlePageVersionRepository`, table `page_versions`). This is the
richest adapter in the codebase in terms of non-obvious query behavior —
read this before touching either class.

## Page + version, one transaction

`saveWithVersion(page, version)` writes the page row and its new version
row in a **single** transaction (`save-page-version-tx.ts`, reused by both
`DrizzlePageVersionRepository.save()` and `DrizzlePageRepository`). This
isn't two separate `save()` calls across the two Ports on purpose — see the
Port's own doc comment: if the version insert failed after the page
upsert had already committed, the page would end up saved with no matching
history entry, silently breaking rollback and the version list on the
single most-used write path in the product (every draft save).

Version pruning is inline, not a scheduled job: `save-page-version-tx.ts`
keeps a **hard cap of the last 10** versions per page, deleting anything
older in the same transaction right after the insert. A page saved 30 times
in one editing session is pruned back to 10 immediately — same policy as
`@kometio/postgres-site-layout-section-repository`'s own version table.

## Sibling-scoped slugs and hierarchy

Pages form a WP-style tree via a nullable self-referencing `parentId`
(`onDelete: 'set null'` — deleting a parent orphans its children rather
than cascading the whole subtree). `slug` is unique only among siblings
under the same `parentId`, not site-wide — see
[ADR-0029](../../../docs/adr/0029-sibling-scoped-page-slug-uniqueness.md).
That needs **two** DB constraints, both mapped to the same
`PageSlugAlreadyExistsError` by `withUniqueViolationMapping` (using
`@kometio/postgres-db`'s `isUniqueViolation`):

- a composite `unique(tenantId, siteId, locale, parentId, slug)` — catches
  collisions under the same non-null parent;
- `pages_root_slug_unique`, a partial unique index (`WHERE parent_id IS
NULL`) — Postgres treats `NULL <> NULL`, so the composite above never
  fires between two root-level pages sharing a slug; the partial index is
  what catches that case.

`findByParentAndSlug` is how the public URL resolver walks a path
segment-by-segment (start at `parentId: null`, feed each match's own `id`
in as the next segment's `parentId`) instead of looking up the trailing
slug alone. It uses `isNull(pages.parentId)` rather than
`eq(pages.parentId, null)` for the root case, since `parent_id = NULL` is
always unknown in SQL.

A second unique constraint, `unique(tenantId, siteId, groupId, locale)`,
enforces one translation per locale within a translation group —
`groupId` links every locale-variant of the same logical page (see
[ADR-0017](../../../docs/adr/0017-multilingua-locale-prefixed-urls-and-page-translations.md)),
and a conflict there maps to `PageTranslationAlreadyExistsError`.
`listByGroup` returns every translation of a page.

## `listBySite` is a bespoke query, not the shared paginated helper

Unlike every other repository in this project, `listBySite` does **not**
use `DrizzlePaginatedRepository.listPaginatedTx` — it needs a lean
projection (`PageSummary`: id/slug/status/seoMeta/timestamps, no
`content`/`publishedContent`) plus a SQL-computed
`hasUnpublishedChanges` (`content IS DISTINCT FROM published_content`).
This exists specifically so the admin page list never ships two full Puck
block trees per row just to render a table — see the security review
noted on `PageSummary`'s own doc comment and the Port's JSDoc.

## `searchText` is a foreign concern living on the same row

`pages.searchText` is written and read exclusively by
`@kometio/postgres-search-repository`'s `DrizzleSearchRepository`, never by
this package. `fromRow()` deliberately maps an explicit field list instead
of spreading the raw row, so `searchText` never leaks into the `Page`
domain entity (and from there into any API response that serializes
`page.toProps()`).

## Tenant scoping

Every query runs inside `withTenant(db, tenantId, ...)` from
`@kometio/postgres-db`, setting `app.current_tenant_id` for the transaction
so Postgres RLS enforces the tenant boundary as a second layer behind the
explicit `tenantId` filters. Connects as the non-superuser `kometio_app`
role — see
[ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Used by

`apps/api` (pages module — CRUD, publish/draft flow, translations,
version history/restore).

## Running unit tests

Run `nx test postgres-page-repository` to execute the unit tests via [Vitest](https://vitest.dev/).
