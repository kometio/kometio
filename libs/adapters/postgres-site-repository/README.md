# postgres-site-repository

Drizzle-backed persistence for sites and their per-block-type theme style
overrides — implements
[`SiteRepositoryPort`](../../ports/src/lib/site-repository.port.ts)
(`DrizzleSiteRepository`, table `sites`) and
[`SiteThemeBlockStylesPort`](../../ports/src/lib/site-theme-block-styles.port.ts)
(`DrizzleSiteThemeBlockStylesRepository`, table `site_theme_block_styles`).

## Two Ports, two very different write patterns

`sites` carries a site's general/SEO settings
([ADR-0016](../../../docs/adr/0016-site-general-and-seo-settings.md)) plus
Tier 1 of the theming model — primary/secondary color, font, custom
CSS/scripts, favicon
([ADR-0021](../../../docs/adr/0021-site-theming-filesystem-packages-and-style-settings.md)).
`DrizzleSiteRepository` is a plain repository (it does **not** extend
`DrizzlePaginatedRepository` — sites aren't paginated anywhere in the
product): `findByDomain`, `findById`, and an upsert `save()`.
`findByDomain` is the hot path of every public request (page rendering,
sitemap, search, site chrome) and is backed by a `unique(tenantId, domain)`
index for exactly that reason — `domain` stays nullable because Postgres
treats multiple `NULL`s as distinct under `UNIQUE`, so several sites of the
same tenant can coexist without a domain configured yet.

`site_theme_block_styles` is a **child table**, one row per
`(site_id, block_type)`, holding a `style` JSONB blob
(`BlockStyleOverride`). It replaced an earlier design where the same data
lived nested inside `sites.theme_tokens.blockStyles` — see
[ADR-0022](../../../docs/adr/0022-component-and-instance-style-overrides.md)
for the full before/after and why: not for correctness (the prior
`jsonb_set`-based `UPDATE` was already atomic per block type), but because
a write here no longer touches the wide `sites` row under MVCC (name,
domain, SEO fields, ...— all unrelated to style), and `WHERE block_type =
'Button'` becomes a normal indexed lookup instead of a JSONB path
traversal. `upsert()` is a direct `INSERT ... ON CONFLICT (site_id,
block_type) DO UPDATE` on this one narrow row; `listBySite` returns every
override for a site as a `Record<blockType, BlockStyleOverride>` (empty map
if nothing was ever customized), which callers reassemble back into the
`{ blockStyles: {...} }` shape the rest of the theming code expects.

## Tenant scoping

Both repositories run every query inside `withTenant(db, tenantId, ...)`
from `@kometio/postgres-db`, setting `app.current_tenant_id` for the
transaction so Postgres RLS enforces the tenant boundary as a second layer
behind the explicit `tenantId` filters. Connects as the non-superuser
`kometio_app` role — see
[ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Used by

`apps/api` (sites module — general/SEO settings, theme settings, and the
public rendering endpoint's site-chrome resolution).

## Running unit tests

Run `nx test postgres-site-repository` to execute the unit tests via [Vitest](https://vitest.dev/).
