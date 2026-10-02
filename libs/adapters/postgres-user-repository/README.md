# postgres-user-repository

Drizzle-backed persistence for admin/editor users (the `users` table) —
implements [`UserRepositoryPort`](../../ports/src/lib/user-repository.port.ts)
via `DrizzleUserRepository`. Underpins
[ADR-0010](../../../docs/adr/0010-session-based-auth-foundations.md)'s
auth foundations (this package owns the account, not the session — see
`sessions`/`verification_tokens` in `@kometio/postgres-db`'s schema, which
this adapter doesn't touch).

## How it's built

Extends `DrizzlePaginatedRepository` from `@kometio/postgres-db` for the
shared save/findById/delete/paginated-list CRUD; `list()` orders by
`createdAt desc` (most recently created first), matching
`PageRepositoryPort.listBySite`'s own convention — added for the admin
"Users" section once a listing endpoint was needed the same way pages
already had one.

## Email uniqueness under real concurrency

`onConflictDoUpdate` (used by the shared `save()`/upsert path) only ever
resolves a conflict on the primary key (`id`, a freshly generated UUID —
never actually in conflict on insert). A conflict on the separate
`unique(tenantId, email)` constraint still surfaces as a raw
`PostgresError` — this is the real failure mode under concurrency, e.g. two
near-simultaneous invites/registrations for the same email both passing the
application's own check-then-act validation. `save()` wraps the upsert in
a try/catch and uses `@kometio/postgres-db`'s `isUniqueViolation` to detect
that specific constraint and translate it into the same
`UserEmailAlreadyExistsError` the use case already throws in the common
case — callers never see a bare 500 from a raw driver error.

## Tenant scoping

Every query runs inside `withTenant(db, tenantId, ...)` from
`@kometio/postgres-db`, setting `app.current_tenant_id` for the transaction
so Postgres RLS enforces the tenant boundary as a second layer behind the
explicit `tenantId` filters. Connects as the non-superuser `kometio_app`
role — see
[ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Used by

`apps/api` (auth module — login/registration lookups by email, and the
admin "Users" management section).

## Running unit tests

Run `nx test postgres-user-repository` to execute the unit tests via [Vitest](https://vitest.dev/).
