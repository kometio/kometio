# ports

The interface layer of this codebase's hexagonal architecture (see
[ADR-0003](../../docs/adr/0003-separate-application-layer-for-use-cases.md)):
one TypeScript interface ("Port") per external capability the application
layer needs — persistence, storage, auth, email, search, captcha,
newsletter, tenant context — with zero knowledge of which concrete
technology implements it. Depends only on `@kometio/domain-core` (entity
types that appear in method signatures) and `@kometio/shared-types` (wire/DTO
value shapes like `SeoMeta`, `BlockStyleOverride`).

## What's here

Nineteen Port interfaces, each in its own file, roughly in three groups:

- **Repositories** — CRUD-shaped persistence contracts for the domain
  entities: `PageRepositoryPort`, `PageVersionRepositoryPort`,
  `SiteRepositoryPort`, `SiteLayoutSectionRepositoryPort` (+ its own
  `*VersionRepositoryPort`), `UserRepositoryPort`, `MediaRepositoryPort`,
  `FormRepositoryPort`, `FormSubmissionRepositoryPort`,
  `SiteThemeBlockStylesPort`. All implemented today by adapters under
  `libs/adapters/postgres-*`.
- **Infrastructure capabilities** — `AuthPort` (password hashing +
  opaque-token sessions),
  `MediaStoragePort` / `AttachmentStoragePort` (local disk or S3, chosen
  per deployment via env var — see each port's own comment for why they're
  two separate interfaces, not one), `EmailPort`, `CaptchaPort`,
  `NewsletterPort` (ships a `NoopNewsletterPort` default so an unconfigured
  deployment degrades to a silent no-op instead of a 500),
  `VerificationTokenPort` / `PreviewTokenPort` (same opaque-token mechanic
  as `AuthPort`'s sessions, single-use vs. re-validatable respectively).
  `ContentSanitizerPort` (what a person typed, made safe to render),
  `DatabaseHealthPort`, `ExpiredRecordsPort` and `TenantDirectoryPort`
  (what the health check, the scheduled clean-ups and the deployment's
  tenant lookup ask of the database), and `DeploymentLocalePort` (the
  language of the site the deployment serves — what an email falls back to
  for somebody who has not chosen one, ADR-0100).
- **Standalone capability ports** — `SearchPort`. Deliberately _not_ a
  method on `PageRepositoryPort`: search has its own storage/query shape
  (Postgres `tsvector`/GIN today; a different engine wouldn't need any of
  `PageRepositoryPort`'s CRUD surface to implement it), so a future
  non-Postgres deployment can swap the search adapter alone.

## Design rules worth knowing

- **Tenant id is always an explicit parameter**, never implicit — every
  repository method signature takes `tenantId` directly rather than reading
  it from some ambient context. This means no Port method can "forget"
  tenant scoping at the type level, even though the Postgres adapters also
  rely on RLS as a second, defense-in-depth barrier.
- **A Port only grows a new capability method when a use case needs it** —
  these interfaces mirror `libs/application`'s use cases, not a
  speculative "complete" CRUD surface. `PageRepositoryPort.saveWithVersion`
  exists specifically so a page save and its version snapshot commit in
  one transaction (a single `save()` + a separate version `save()` could
  leave a page persisted with no matching history row if the second write
  failed).
- **MediaStoragePort vs. AttachmentStoragePort** — both are byte-storage
  ports for uploads, deliberately not unified: `MediaStoragePort` is the
  curated, image-only media library (every upload processed through sharp,
  see [ADR-0013](../../docs/adr/0013-media-pipeline-local-serving-upload-time-resize.md)),
  while `AttachmentStoragePort` stores a public form's raw file-upload
  field verbatim (PDF, Office docs, ZIP, ...) with no image processing —
  merging them would force one of the two use cases to fight the other's
  assumptions.

## Used by

`libs/application`'s use cases depend on these interfaces (constructor
injection), never on a concrete adapter. `apps/api` is the only app that
imports `@kometio/ports` directly (its NestJS modules wire a concrete
`libs/adapters/*` implementation to each Port token at bootstrap).
`apps/editor-app` and `apps/public-site` never see a Port — they only talk
to `apps/api` over HTTP, through `@kometio/shared-types`' wire schemas.

## Running unit tests

Run `nx test ports` to execute the unit tests via [Vitest](https://vitest.dev/).
