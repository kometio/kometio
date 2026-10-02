# api-contracts

The wire shapes of the HTTP API: a Zod schema (and the type inferred from
it) for every record, paginated list, request and streamed event that the
API and its clients agree on — `SiteRecord`, `PageGroupRecord`,
`PageTranslationRecord`, `MediaRecord`, `FormRecord`, `PublishedPage`,
`PublishedSite`, the page generation events, and the rest.

The API's controllers build these, the editor and the public site parse
what arrives through them ([ADR-0026](../../docs/adr/0026-shared-zod-schemas-for-api-response-shapes.md)),
and `@kometio/testing` builds valid ones for specs.

## What does not belong here

- **Anything a domain rule reads.** The tag is `contracts`, and no library
  tagged `domain` may depend on it (`@nx/enforce-module-boundaries`): a
  status list, a kind, a role, a value object lives in `@kometio/shared-types`
  and this library imports it, never the other way round. When a record file
  needed one of those, it was split — `page-status.ts` stayed, the record
  moved (ADR-0096).
- **Request bodies of one controller.** Those sit next to it in
  `apps/api`, as `*.schemas.ts`.
- **Adapters.** A persistence adapter maps rows to entities; it does not
  know how a client reads them.

## Tests

Each schema is checked against what the API sends and against the input it
must refuse. `site-samples.test-fixture.ts` holds one complete site value
for the specs that need one.
