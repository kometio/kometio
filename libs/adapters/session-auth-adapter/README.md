# session-auth-adapter

`AuthPort` implementation: password hashing plus DB-backed session
management. A roll-your-own design, not a library like Lucia Auth (which
was deprecated in March 2025) — see
[ADR-0010](../../../docs/adr/0010-session-based-auth-foundations.md).

## Implements

`AuthPort` (`libs/ports/src/lib/auth.port.ts`) — password
hash/verify plus `createSession`/`validateSession`/`invalidateSession`/
`invalidateAllSessionsForUser`.

## How it works

- **Passwords**: `argon2id` via `@node-rs/argon2` (`hash`/`verify`), no
  manual salt/parameter handling — the library manages both.
- **Sessions**: opaque tokens, not JWTs. `@kometio/opaque-token` generates a
  random token and returns its SHA-256 hash; only the hash is persisted
  in the `sessions` table, so a leaked database row alone can never be
  replayed as a valid cookie. `SESSION_DURATION_MS` (30 days) is exported
  so `apps/api` can size the session cookie's `maxAge` to match — the
  cookie is only ever a client-side hint, the server always re-validates
  against `sessions.expires_at` regardless of what the cookie claims.
- **Sliding renewal**: `validateSession` extends `expiresAt` by another
  full `SESSION_DURATION_MS` whenever less than half the window remains
  (`SESSION_RENEWAL_THRESHOLD_MS`), so an active user is never logged out
  mid-session, but an abandoned session still expires.
- **The `bootstrapTenantId` chicken-and-egg**: `validateSession` and
  `invalidateSession` look a session up by its (globally unique) token
  hash _before_ the tenant is known, but Postgres RLS requires
  `app.current_tenant_id` to be set for any row to be visible at all —
  even one matched by a globally-unique key. The adapter works around
  this by opening its lookup transaction under a fixed
  `bootstrapTenantId`. This is safe only under the current
  single-tenant-per-deployment MVP model, where every session row already
  belongs to that one tenant — see the ADR for what has to change if
  Kometio ever becomes genuinely multi-tenant.
- Connects to Postgres as the non-superuser `kometio_app` role, per
  [ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Used by

`apps/api` — wired as `AUTH_PORT` in `AuthModule`
(`apps/api/src/app/auth/auth.module.ts`), constructed with the shared
`KometioDb` and `DEFAULT_TENANT_ID` (which doubles as `bootstrapTenantId`
here).

## Running unit tests

Run `nx test session-auth-adapter` to execute the unit tests via [Vitest](https://vitest.dev/).
