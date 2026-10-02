# postgres-search-repository

Postgres full-text search for published pages — implements
[`SearchPort`](../../ports/src/lib/search.port.ts) via
`DrizzleSearchRepository`.

## Why its own Port

`SearchPort` is deliberately separate from `PageTranslationRepositoryPort`
even though both operate on the `page_translations` table: search is a distinct capability with its
own storage/query shape (this adapter uses Postgres `tsvector` + a GIN
index; a different engine — MariaDB FULLTEXT, SQLite FTS5, MongoDB `$text`
— would need none of the page repositories' CRUD surface to implement the
same Port). Keeping them separate means a future non-Postgres deployment
could swap only the search adapter without touching page persistence.

## How indexing works

`indexPage(tenantId, siteId, translation, content)` extracts plain
searchable text from the translation's `seoMeta` and the published
`content` via `extractSearchableText` (`@kometio/shared-types`) and writes it
to the plain `page_translations.search_text` column.
`page_translations.search_vector` — a `tsvector` **generated column**
derived from `search_text` — is defined at the SQL level (see
`drizzle/0000_baseline_schema.sql`; Drizzle's schema builder has no
first-class generated-column DSL) and is never read or written directly by
this class, only queried through its GIN index in `search()`. Indexing is
idempotent and only ever called after a page is published — there's no
`removeFromIndex`: deleting the page removes its row, and an unpublished
page is simply never indexed.

## How `search()` works

Runs a raw SQL query (`tx.execute`, not the query builder) against
`search_vector @@ plainto_tsquery(...)`, ranked by `ts_rank`, filtered to
`status = 'published'` — a draft is never surfaced here regardless of
whether it happens to be indexed. The excerpt is built by Postgres's own
`ts_headline`, not fetched-then-excerpted in application code.

`ts_headline`'s `StartSel`/`StopSel` are set to inert control characters
(`\x01`/`\x02`), **not** literal `<mark>` tags: `search_text` is extracted
from editor-authored prose (Hero titles, Text bodies, ...), so wrapping a
match in real HTML here would mean the excerpt could contain arbitrary
editor-typed text sitting next to a genuine tag — safe only for as long as
nothing ever renders it with `dangerouslySetInnerHTML`/`set:html`. Callers
get plain text with match boundaries encoded via those marker characters
instead.

The `'italian'` text-search configuration is currently hardcoded in both
`indexPage`'s downstream extraction and the `search()` query — there's no
per-locale dictionary selection yet even though pages are multilingual
([ADR-0017](../../../docs/adr/0017-multilingua-locale-prefixed-urls-and-page-translations.md)).

## Tenant scoping

Runs inside `withTenant(db, tenantId, ...)` from `@kometio/postgres-db`,
setting `app.current_tenant_id` for the transaction so Postgres RLS
enforces the tenant boundary as a second layer. Connects as the
non-superuser `kometio_app` role — see
[ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Used by

`apps/api` (site search endpoint, and the publish flow which calls
`indexPage` after a page goes live).

## Running unit tests

Run `nx test postgres-search-repository` to execute the unit tests via [Vitest](https://vitest.dev/).
