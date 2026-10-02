# postgres-form-repository

Drizzle-backed persistence for form definitions and their submissions —
implements [`FormRepositoryPort`](../../ports/src/lib/form-repository.port.ts)
(`DrizzleFormRepository`, table `forms`) and
[`FormSubmissionRepositoryPort`](../../ports/src/lib/form-submission-repository.port.ts)
(`DrizzleFormSubmissionRepository`, table `form_submissions`), see
[ADR-0015](../../../docs/adr/0015-form-builder-architecture.md) and
[ADR-0020](../../../docs/adr/0020-form-builder-anti-spam-newsletter-attachments-multistep.md).

## Two repositories, two lifecycles

`forms` (the builder's own definition: `fields`/`steps` JSONB, notification
email) and `form_submissions` (one immutable row per visitor submission,
`payload` JSONB) are deliberately separate Ports even though they share a
package — a form's schema is mutable and versioned by the editor, while a
submission is write-once history that must survive the form or the page it
was submitted from being deleted later (`pageId`/`formId` are nullable,
`onDelete: 'set null'`, not cascaded).

`DrizzleFormRepository` extends `DrizzlePaginatedRepository` from
`@kometio/postgres-db` for the standard save/findById/delete/paginated-list
CRUD shared across tenant-scoped tables; `listBySite` orders by
`updatedAt desc`, matching the pages/media list convention.
`DrizzleFormSubmissionRepository` only ever inserts — there's no
findById/list/delete on the Port because nothing in the product reads
submissions back through this adapter yet (they're exported/consumed
elsewhere); it doesn't extend the paginated base since it has none of that
shared CRUD surface.

## Tenant scoping

Every query runs inside `withTenant(db, tenantId, ...)` from
`@kometio/postgres-db`, which sets `app.current_tenant_id` for the
transaction so Postgres RLS enforces the tenant boundary as a second layer
behind the explicit `tenantId` filters in each query — the adapter connects
as the non-superuser `kometio_app` role, see
[ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Used by

`apps/api` (forms module — CRUD on definitions, and recording public
submissions from `apps/public-site`'s form endpoint).

## Running unit tests

Run `nx test postgres-form-repository` to execute the unit tests via [Vitest](https://vitest.dev/).
