# 0026 — Shared Zod schemas as the single source of truth for API response shapes

**Status**: Accepted — 2026-08-27

## Context

`apps/public-site` and `apps/editor-app` each hand-wrote their own
TypeScript interface for every shape `apps/api` returns —
`PublishedSiteDto` (public-site) and `SiteDto` (editor-app) both
described the same `Site`, independently. Neither was generated from, or
type-checked against, what `apps/api` actually sends: `SitesController`'s
`toDto()` had no declared return type at all (TypeScript inferred one
from the object literal), so nothing would have caught the two client
types drifting from the server or from each other.

They already had: `PublishedSiteDto` grouped theme fields into
`themeSettings`/`themeTokens`; `SiteDto` kept them flat
(`themePrimaryColor`, `themeCustomCss`, ...) and additionally carried
`id`/`tenantId`/`createdAt`, which the public one omits. Legitimate
differences — public-site only needs OG-tag/schema.org fields, editor-app
needs the full row — but neither side had any mechanism that would have
caught an _illegitimate_ drift (a field renamed or dropped on one side
by accident) before it broke in production. Every network boundary in
this codebase was also validated exactly once: the moment `res.json()`
returned, a raw `unknown` value from an untrusted network response was
cast to a TypeScript type and trusted from then on, with zero runtime
check that it actually matched.

`Page` had the same shape of problem across more surfaces:
`PublishedPage` (`libs/application`) and `PublishedPageDto`
(public-site) were exact duplicates of each other (not just
similar — identical field-for-field); `PageDto`/`PageSummaryDto`/
`PageVersionDto` (editor-app) were three more hand-copied shapes, each
mirroring one of `PagesController`'s endpoints with no declared return
type to check against.

## Decision

Response shapes move into `libs/shared-types` as Zod schemas, the same
pattern this codebase already used for shared _value_ types
(`ThemeSettings`, `ThemeTokens`, `SeoMeta`, `Block`) but had never
extended to full response envelopes:

- `publishedSiteSchema`/`PublishedSite`, `siteRecordSchema`/`SiteRecord`
  (`published-site.ts`, `site-record.ts`)
- `publishedPageSchema`/`PublishedPage`,
  `pageRecordSchema`/`PageRecord`, `pageListItemSchema`/`PageListItem`,
  `pageVersionRecordSchema`/`PageVersionRecord`
  (`published-page.ts`, `page-record.ts`)

Each schema composes existing shared-types schemas wherever one already
covered part of the shape (`publishedSiteSchema` reuses
`themeSettingsSchema`/`themeTokensSchema`/`businessInfoSchema`; the two
`Page` schemas reuse `blockSchema`/`seoMetaSchema`) rather than
redeclaring fields — the value this ADR is chasing is one definition per
concept, not just one definition per response.

`apps/api`'s controllers gain an explicit, schema-derived return type
(`Promise<SiteRecord>`, `Promise<PageRecord>`, ...) and call
`schema.parse(...)` on the object they're about to return, not just cast
it — `SitesController.toDto()`/`PagesController.toDto()` now fail loudly,
server-side, the moment their own output stops matching the contract,
instead of silently shipping a malformed response for a client to
misinterpret. `apps/public-site`/`apps/editor-app`'s api-client modules
call the matching `schema.parse(...)` on every `res.json()` result before
returning it — the first genuine runtime validation this codebase's
network boundary has ever had in either direction.

`libs/ports`'s own `PageSummary` interface (the repository-layer
contract `listBySite` returns) is deliberately **not** merged into
`PageListItem`, even though they carry the same fields today — one is an
internal Port contract between the application and adapter layers, the
other is the wire shape a client parses; conflating them would make a
future change to one look like it must also change the other; nothing
requires that today.

## Consequences

- `createdAt`/`updatedAt`/version timestamps are `Date` on domain
  entities but `z.string()` (ISO) in every schema above — a controller
  must call `.toISOString()` explicitly before `.parse(...)`; passing the
  raw `Date` through fails validation immediately (a real bug caught
  this way during implementation, not a hypothetical).
- Schema fields added _after_ real content already exists in the
  database must be `.nullish()` (accepts `null` **and** `undefined`),
  never just `.nullable()` — existing JSON blobs (page `content`, in
  particular) predate the new field entirely and have the key _absent_,
  not `null`. This surfaced concretely extending `pickedMediaSchema`
  with `width`/`height`: verified against a real stored page's JSON
  before shipping, not assumed.
- Every schema addition here is additive to already-shipped response
  shapes — no client that only reads the pre-existing fields needed to
  change.
- Established as the pattern going forward: `Form`/`Media` DTOs were not
  touched by this pass (no confirmed drift found there yet) but the same
  treatment applies identically if/when they need it.
