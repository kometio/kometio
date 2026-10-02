# 0096 — The wire shapes of the HTTP API are their own library

**Status**: Accepted — 2026-09-30

## Context

`libs/shared-types` held 9,441 lines in 60 source files and was tagged
`domain`.
It carried three different things: the vocabulary the domain reads (the
content model, statuses, kinds, roles), the values a site is configured
with, and the shapes the HTTP API answers with (`SiteRecord`,
`PageGroupRecord`, `PublishedPage`, ...).

Because the whole library was `domain`, nothing stopped a domain rule from
being written in terms of a response DTO, and the record files did mix the
two: `page-record.ts` held `PAGE_TRANSLATION_STATUSES` — read by the domain
and by the database enum — beside the schemas of every page response.

## Decision

- **`@kometio/api-contracts`** (`libs/api-contracts`, tag `contracts`) holds
  the record and response schemas: the `*-record` files, the paginated
  lists, `PublishedPage`, `PublishedSite`, `PublishedTerm`,
  `PublishedAuthor`, the account profile, the page generation request /
  event / settings shapes, the header names the public site sends the API.
- **A file that mixed vocabulary and record was split**, the vocabulary
  staying in `@kometio/shared-types` under a name of its own: `page-status`,
  `storage-provider`, `import-job-status`, `site-layout-section-kinds`;
  `taxonomy` keeps `LocalizedText`; `author` keeps the roles, the path
  segments and the block props (the author box embeds `PublicAuthor`);
  `page-generation` keeps the provider and failure lists and the
  placeholder rules.
- **The boundary is a lint rule.** `contracts` may depend on `domain` and
  `contracts`; `application`, `app` and `testing` may depend on `contracts`;
  `domain` and `adapter` may not, and the rule was shown to refuse both with
  a probe file. Nothing in the adapters needed a response shape.
- Specs in `api-contracts` check each schema against a payload the API
  sends and against one it must refuse; a site's nested settings come from
  one `test-fixture` file.

## Consequences

- A domain library that needs a shape from a response has to be redesigned
  around what the domain means; it can no longer import the DTO.
- A new record schema goes to `api-contracts`; a new list that the domain
  or a database enum reads goes to `shared-types`.
- Imports of the moved names changed in 90 files (`apps/api`,
  `apps/editor-app`, `apps/public-site`, `libs/application`, `libs/testing`,
  one theme). Names that both moved and stayed in one import were split
  across two statements.
- About 920 lines in 17 files moved out of `@kometio/shared-types` (9,441 →
  8,593 lines in 51 source files, four of them new vocabulary files). It is
  still the largest library: the block props and the theme-upload state
  remain in it on purpose, since the upload status is read by a port and an
  adapter, which the contracts tag would forbid.
