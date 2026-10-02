# verification-token-adapter

`VerificationTokenPort` implementation: DB-backed, single-use tokens for
email verification and password reset. See
[ADR-0011](../../../docs/adr/0011-email-verification-password-reset.md).

## Implements

`VerificationTokenPort` (`libs/ports/src/lib/verification-token.port.ts`)
— `createToken`/`consumeToken`, scoped by a `VerificationTokenPurpose`
(`@kometio/domain-core`) so a token minted for one purpose (e.g. password
reset) can never be consumed for another (e.g. email verification).

## How it works

Same opaque-token mechanic as `@kometio/session-auth-adapter`
(`@kometio/opaque-token`: random token, only its SHA-256 hash persisted),
but for one-time rather than multi-use tokens.

`consumeToken` is a single `DELETE ... RETURNING`, not a `SELECT` followed
by a separate `DELETE` — this makes single-use atomic: a concurrent
second consume of the same token finds nothing left to delete, so
double-consumption (e.g. a password-reset link opened twice) can't race,
with no explicit row locking needed. Expiry is checked after the delete;
an expired-but-deleted token still returns `null`.

Shares the same `bootstrapTenantId` RLS chicken-and-egg as
`SessionAuthAdapter`: `consumeToken` looks a token up by its
globally-unique hash before the tenant is known, so the lookup runs under
a fixed bootstrap tenant — safe under the current
single-tenant-per-deployment MVP model (see
[ADR-0010](../../../docs/adr/0010-session-based-auth-foundations.md)).
Connects as the non-superuser `kometio_app` role, per
[ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Used by

`apps/api` — wired as `VERIFICATION_TOKEN_PORT` in `AuthModule`
(`apps/api/src/app/auth/auth.module.ts`), used for both email
verification and password-reset flows.

## Running unit tests

Run `nx test verification-token-adapter` to execute the unit tests via [Vitest](https://vitest.dev/).
