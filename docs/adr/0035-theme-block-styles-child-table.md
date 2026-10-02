# 0035 — Per-block-type theme style overrides: a dedicated child table, not a JSONB blob

**Status**: Accepted — 2026-08-25

## Context

`docs/adr/0022` introduced instance/component-level style overrides
(`theme_tokens`, `sites.theme_tokens: jsonb`) as a single sparse JSONB
column: `{ blockStyles: { Hero: {...}, Button: {...} } }`. This worked,
but had two real weaknesses surfaced by later work in the same area:

1. **Write concurrency**: `updateSiteThemeTokens` originally did
   `findById` → mutate in memory → full-row `save()` — a lost-update bug
   under concurrent edits to two different block types on the same
   site. Fixed first, independently of the schema question, as an
   atomic `jsonb_set(...)` UPDATE (`docs/adr/0022`'s "Follow-up
   (2026-08-24)" section, PR #83) — `jsonb_set`'s `create_missing=true`
   only creates the _last_ path segment, so a `coalesce` to a
   pre-shaped `{"blockStyles":{}}` base was required to make this safe
   against a NULL column, verified directly against real Postgres.
2. **MVCC write footprint and query granularity**: even after the
   atomic-UPDATE fix, every style write still rewrote the entire wide
   `sites` row (Postgres UPDATE, MVCC-wise, always writes a new row
   version regardless of which column changed), and there was no way to
   query or index "sites with a Button style override" without
   unpacking JSONB.

The user reopened the blob-vs-columns schema question a second time
(distinct from the concurrency fix above), explicitly asking for
independent third-party opinions rather than a single self-consistent
recommendation, given the project's open-source ambitions — external
contributors judge structural hygiene, not just correctness.

**How the decision was reached is worth recording, not just the
outcome**: a first independent agent confirmed the single-JSONB-blob
design over typed per-block-type columns, but named a third option
nobody had raised yet — a normalized child table (one row per
`site_id, block_type`, still JSONB _inside_ each row). A second
independent agent evaluated that child-table option and argued its main
benefit was "atomic per-type writes" — an argument that was caught as
**already factually stale** before the user decided: the same-day
`jsonb_set` concurrency fix had already made per-type writes on the
single blob atomic, so that specific argument no longer distinguished
the two designs. The child table's real, surviving justification was
identified independently of that stale claim: smaller MVCC write
footprint (an UPDATE to one block type's style no longer rewrites the
whole `sites` row) and direct per-block-type query/index capability —
both real hygiene/performance properties, neither about correctness.

## Decision

`sites.theme_tokens` is dropped. A new table,
`site_theme_block_styles(tenant_id, site_id, block_type, style jsonb,
primary key(site_id, block_type))`, replaces it — one row per site per
customized block type, migrated via 3 sequenced migrations (create
table → data-copy via `jsonb_each` + RLS → drop the old column), PR #84
(2026-08-25).

A new `SiteThemeBlockStylesPort` + `DrizzleSiteThemeBlockStylesRepository`
own this table — a dedicated Port, following the same reasoning already
established for `SearchPort` (docs/adr/0022's era): a distinct
capability warrants its own port rather than being folded into
`SiteRepositoryPort`. `Site`/`SiteProps` (`libs/domain-core`) no longer
carries `themeTokens` at all; it moved fully out of the `Site`
aggregate.

**The HTTP contract is deliberately unchanged.** `GET /sites/:id` and
`PATCH /sites/:id/theme-tokens` still return/accept `themeTokens: {
blockStyles: {...} }`, composed server-side from `site.toProps()` +
`listBySite(...)` via a shared `toDto()` helper used by every mutation
handler on `SitesController`, not just the theme-tokens one — chosen
specifically so no handler could silently drop `themeTokens` from its
response, which would have broken editor-app's whole-object cache
overwrite on save. `resolveSiteChrome` (the public, unauthenticated
rendering path) fetches block styles via the new port in `Promise.all`
alongside header/footer, same as before. Zero editor-app or
public-site consumer code needed to change.

## Consequences

- Two schema changes to the same feature landed within a day of each
  other (PR #83's concurrency fix, then PR #84's table split) — the
  concurrency fix was not wasted work superseded by the table split; the
  atomic-`jsonb_set` UPDATE pattern it established is exactly what
  `DrizzleSiteThemeBlockStylesRepository`'s per-row writes build on, now
  scoped to a single narrow row instead of a wide one.
- The "shared theme entity reused across multiple sites by one agency"
  question (a separate, adjacent idea raised during the same
  discussion) stays explicitly deferred — no schema decision was made
  for it, and this ADR does not cover it.
- Live-verified in all three directions before merging: read (editor's
  "Stile globale" dialog showed a real migrated value), write (changed
  a value via the editor UI, confirmed via direct `psql` it landed in
  the new table), public render (`curl`'d a published page, confirmed
  the CSS custom property was sourced from the new table via
  `resolveSiteChrome`).
- A lesson about process, not schema, worth keeping alongside the
  decision: an independent second-opinion agent's argument was
  well-reasoned but referenced a fact (per-type writes not yet being
  atomic) that had become stale within the same session — it was
  cross-checked against the actual current codebase before being
  accepted, rather than relayed as-is. The schema decision above rests
  on the argument that survived that check (MVCC footprint + query
  granularity), not the one that didn't (atomicity).
