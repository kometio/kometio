# postgres-media-repository

Drizzle-backed persistence for uploaded media metadata (the `media` table) —
implements [`MediaRepositoryPort`](../../ports/src/lib/media-repository.port.ts)
via `DrizzleMediaRepository`. See
[ADR-0013](../../../docs/adr/0013-media-pipeline-local-serving-upload-time-resize.md)
for the wider media pipeline this row is part of.

## What it stores

One row per uploaded asset: `filename`, `storageKey` (where the
`MediaStoragePort` adapter — `@kometio/local-disk-media-storage` or
`@kometio/s3-media-storage`, selected via `storageProvider` — actually put
the bytes), `storageProvider`, `mimeType`, `size`, and optional
`width`/`height` (populated at upload time for images — see ADR-0013). This
adapter only ever persists that metadata row; it never touches the file
bytes themselves, which is exactly the split `MediaRepositoryPort` /
`MediaStoragePort` is meant to enforce (one Port for "what do we know about
this file", a separate one for "where do the bytes live").

## How it's built

Extends `DrizzlePaginatedRepository` from `@kometio/postgres-db`, so
save/findById/delete and the paginated CRUD shape come from the shared
base — this adapter only supplies the `media` table/columns and the
domain-entity mapping (`toRow`/`fromRow`). `listBySite` scopes to
`(tenantId, siteId)` and orders by `createdAt desc` (most recently uploaded
first), matching the pages list's own ordering convention.

## Tenant scoping

Every query runs inside `withTenant(db, tenantId, ...)` from
`@kometio/postgres-db`: it sets `app.current_tenant_id` for the transaction so
Postgres RLS enforces the tenant boundary as a second layer behind the
explicit `tenantId` filters already in each query. The adapter connects as
the non-superuser `kometio_app` role — see
[ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Used by

`apps/api` (media library module — upload, listing, and delete endpoints).

## Running unit tests

Run `nx test postgres-media-repository` to execute the unit tests via [Vitest](https://vitest.dev/).
