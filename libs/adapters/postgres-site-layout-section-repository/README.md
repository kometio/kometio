# postgres-site-layout-section-repository

Drizzle-backed persistence for site-level header/footer layout sections and
their version history — implements
[`SiteLayoutSectionRepositoryPort`](../../ports/src/lib/site-layout-section-repository.port.ts)
(`DrizzleSiteLayoutSectionRepository`, table `site_layout_sections`) and
[`SiteLayoutSectionVersionRepositoryPort`](../../ports/src/lib/site-layout-section-version-repository.port.ts)
(`DrizzleSiteLayoutSectionVersionRepository`, table
`site_layout_section_versions`). See
[ADR-0018](../../../docs/adr/0018-site-level-header-footer-layout-sections.md).

## What a "layout section" is

At most one header and one footer per `(site, locale)` — a `unique(tenantId,
siteId, locale, kind)` constraint enforces this at the DB level. Unlike
pages, a layout section is applied automatically around every page of that
locale rather than placed by hand; `kind` (`'header' | 'footer'`) and
`sticky` (pin-to-top on scroll, meaningful only for `kind = 'header'`, not
DB-enforced) are the only fields that distinguish it from a page. Content
uses the exact same block-tree shape as `pages.content`/`publishedContent`
(draft vs. published, same `PageContent` type).

`findBySiteLocaleKind` is the lookup the public rendering path (and the
editor) actually uses — `findById` exists for the generic
save/find/version-history flow shared with pages, but callers almost always
know "the header for this site+locale", not an id.

## Version history mirrors `postgres-page-repository`

`DrizzleSiteLayoutSectionRepository` extends `DrizzlePaginatedRepository`
from `@kometio/postgres-db` for the standard save/findById CRUD (no
`delete`/`list` on the Port — there's no UX today for removing a site's
header, added if/when it's actually needed). Version saving follows the
identical pattern used by `@kometio/postgres-page-repository`:
`save-site-layout-section-version-tx.ts` inserts the version and prunes
anything past the last 10 per section in the same transaction, no
scheduled job — same hard-cap policy, same rationale (a section edited 30
times in one session is pruned back to 10 immediately, not kept unbounded
within some age window).

## Tenant scoping

Every query runs inside `withTenant(db, tenantId, ...)` from
`@kometio/postgres-db`, setting `app.current_tenant_id` for the transaction
so Postgres RLS enforces the tenant boundary as a second layer behind the
explicit `tenantId` filters. Connects as the non-superuser `kometio_app`
role — see
[ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Used by

`apps/api` (site layout module — editing header/footer per locale, and the
public-page rendering endpoint that resolves site chrome).

## Running unit tests

Run `nx test postgres-site-layout-section-repository` to execute the unit tests via [Vitest](https://vitest.dev/).
