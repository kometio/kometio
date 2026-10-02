# 0014 — SEO metadata editing surface, and schema.org scope

**Status**: Accepted — 2026-08-18

## Context

Phase 5 (`piano-progetto-astro-cms.md`) needs real SEO: editable per-page
metadata, OG tags, a sitemap, and structured data (schema.org). `seoMeta`
(title/description/canonical) already exists on `Page` and already renders
on apps/public-site, but nothing in the editor lets a content editor change
it after page creation — it's frozen at whatever was set when the page was
made. Two real decisions remained before writing any code: where SEO
editing lives in the editor UI, and how rich the generated schema.org
markup should be.

## Decision

### SEO editing lives in its own panel, not Puck's root fields

Considered: (A) a separate settings panel/dialog outside Puck, saving
`seoMeta` through its own API call; (B) Puck's own root-fields mechanism
(`config.root.fields`), which already surfaces a "Page" tab in the editor
chrome today, unused.

Chose A. Puck's root props live in `data.root.props`, part of Puck's own
data format — `puck-data-mapper.ts` deliberately ignores `root.props`
today (`toPuckData` always writes `{}`, `fromPuckData` never reads it), and
routing `seoMeta` through it would mean the domain's `Page.seoMeta` has to
round-trip through Puck's data shape to reach storage. That's exactly the
coupling ADR-0007 rules out: "any consumer of page content that isn't the
editor... can walk children directly without knowing anything about
Puck." `seoMeta` isn't block content — keeping it on its own API surface
means Puck stays fully removable without touching how pages carry their
own metadata.

### schema.org: WebSite/WebPage plus LocalBusiness, with multi-range opening hours

Considered: (A) minimal — WebSite + WebPage only, no new schema; (B)
LocalBusiness too — address, phone, business type, opening hours.

Chose B, confirmed with the user. Kometio's target is explicitly local
businesses (ristoranti, professionisti — see "Contesto e obiettivo"), and
LocalBusiness rich results are one of the more commonly requested SEO
wins for that segment (mirrors what Yoast SEO's "Local SEO" add-on and
Rank Math's Local Module both do for WordPress — neither is core WP,
both are the de facto expectation for this vertical). Requires new fields
on `sites`: address, phone, business type, and opening hours.

Opening hours modeled as one entry per weekday, each holding zero or more
`{opens, closes}` ranges (empty = closed that day) — supports a lunch-break
closure (two ranges in one day), matching Yoast's own model rather than a
single-range-per-day simplification, confirmed with the user. Maps
directly to schema.org's `OpeningHoursSpecification` (one entry per
day+range pair).

## Consequences

- `sites` gains `businessAddress`, `businessPhone`, `businessType`,
  `openingHours` (JSONB) — all nullable, a site with none of them set
  falls back to a plain `WebSite`/`WebPage` schema.org block with no
  `LocalBusiness` node, not a broken one.
- A new authenticated endpoint for editing a page's `seoMeta` (independent
  of the draft/publish content endpoints) and a new one for a site's
  business fields — both outside Puck's own save flow entirely.
- **Explicitly not locked in.** If the product later needs per-page
  (rather than per-site) business info, or multi-location businesses,
  that's new fields/tables added alongside this, not a rewrite — this
  covers the common single-location case the product targets today.
