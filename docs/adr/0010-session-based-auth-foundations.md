# 0010 — Session-based auth foundations, roll-your-own instead of Lucia/Better-Auth

**Status**: Accepted — 2026-08-17

## Context

The plan (`piano-progetto-astro-cms.md`) lists Phase 3 (auth) as: argon2id
hashing, email verification, password reset with expiring tokens, sessions
via httpOnly+secure+sameSite cookies, rate limiting on login, backed by
"Lucia Auth o Better-Auth come base."

That premise no longer holds: **Lucia Auth was deprecated in March 2025** —
the npm package carries an official deprecation notice, the last code push
to the repo was July 2025, and the project repositioned itself as a
learning resource ("build sessions from scratch using our reference code")
rather than a library to install. Building `lucia-auth-adapter` on it would
mean depending on an abandoned package from day one.

## Decision

**Roll-your-own**, following the exact pattern Lucia's own reference code
now recommends — no third-party auth framework. Confirmed with the user
against the alternative (Better-Auth): Better-Auth is actively maintained
and genuinely self-hosted, but it wants to own its own `user`/`session`/
`account`/`verification` tables, which would need a non-trivial adapter
layer to reconcile with the `users` table this project already built
(multi-tenant, RLS, a `User` domain entity already modeling
`passwordHash`/`emailVerifiedAt`) — friction the roll-your-own path avoids
entirely, and consistent with this project's Ports & Adapters discipline
(the auth _behavior_ is a first-class adapter we own, not delegated to a
framework's opinions about its own persistence).

This PR ships the foundation only: `POST /auth/login`, `POST /auth/logout`,
session validation wired into `PagesController`, and a minimal editor-app
login screen — everything needed for the previously-passwordless editor to
require a real session again. Email verification and password reset
(needs `EmailPort` + an SMTP adapter, neither built yet) are explicitly
deferred to a follow-up PR.

### New dependencies (not anticipated by the plan's stack table)

- **`@node-rs/argon2`**, not `argon2`/node-argon2: ships prebuilt binaries
  via napi-rs, no node-gyp/python/C-toolchain needed in the production
  Docker image — consistent with the plan's "distribuzione container-first"
  principle. Required a `node-loader` webpack rule in `apps/api` (see
  below) — its native binding is resolved via a dynamic
  `require()` built from `process.platform`/`arch`, which webpack can't
  trace statically; left alone it tries to parse the `.node` binary as JS
  and fails the build.
- **`@nestjs/throttler`**: official NestJS rate-limiting module, in-memory
  store. Sufficient for Kometio's deployment model (single self-hosted
  instance via docker-compose, no Redis in the stack) — applied only to
  `POST /auth/login` (5 attempts/minute), not globally.
- **`cookie-parser`**: standard Express middleware to read the session
  cookie on incoming requests.

### Session design

- Opaque random token (`node:crypto`, 32 bytes, base64url) — not a JWT.
  Session lookups go through a real DB row, so a tampered/forged cookie
  value simply matches no row and is rejected; no separate HMAC signature
  needed on top.
- **The plaintext token is never persisted anywhere** — only its SHA-256
  hash is stored in the new `sessions` table (`libs/adapters/postgres-db`,
  RLS-enabled like every other tenant-scoped table). SHA-256, not argon2:
  the token is already high-entropy and random, so there's no dictionary to
  defend against and no reason to pay argon2's deliberate slowness on every
  request's session lookup. If the DB leaks, the hashes alone don't yield
  usable session tokens.
- Cookie: `httpOnly` (illegible to JS/XSS) + `secure` in production +
  `sameSite=lax` (blocks cross-site state-changing requests, still allows
  normal top-level navigation). Verified directly with the user before
  implementing — this is the same session model Django/Rails/GitHub use.
- `validateSession` renews the session (new `expires_at`) once it's past
  the halfway point of its 30-day lifetime, so an actively-used session
  never forces a surprise logout, without needing an unbounded lifetime.
- **`bootstrapTenantId` — the RLS chicken-and-egg**: `validateSession`/
  `invalidateSession` look a session up by its (globally unique) token hash
  _before_ the tenant is known, but `sessions` has the same forced-RLS
  policy as every other table — a query with no `app.current_tenant_id` set
  returns zero rows, full stop, regardless of how precise the `WHERE`
  clause is. `SessionAuthAdapter` takes a `bootstrapTenantId` constructor
  argument (wired from `DEFAULT_TENANT_ID`) to satisfy that mechanical
  requirement. This is safe _only_ because Kometio is single-tenant per
  deployment by design (see "Cosa NON fare nell'MVP" in the plan — no
  multi-tenant hosted offering) — every session row already belongs to
  that one tenant. A genuinely multi-tenant Kometio would need a different
  mechanism here (e.g. a narrow `SECURITY DEFINER` lookup function), not
  this shortcut.

### `DEFAULT_TENANT_ID` outlives ADR-0006's stated plan, with a narrower job

ADR-0006 said `DEFAULT_TENANT_ID` should be dropped once auth lands.
`StaticTenantContextAdapter` — which applied it to _every_ pages request,
authenticated or not — is retired exactly as planned, replaced by
`SessionTenantContextAdapter` (request-scoped, reads the tenant the guard
already resolved from the session). But `DEFAULT_TENANT_ID` itself
survives, repurposed narrowly: it's the tenant `POST /auth/login` and
`SessionAuthAdapter`'s bootstrap lookups use, since nothing else could
supply a tenant before a session exists in a single-tenant deployment. The
seed script (`seed-default-tenant.ts`) and its env var didn't disappear —
they now mean "the tenant this self-hosted instance serves," which is
arguably a better description of what they were already doing.

### No public registration endpoint

A self-hosted, single-tenant CMS has no legitimate use case for open
self-signup — anyone who could reach the instance could create an account.
Confirmed with the user: this PR ships **no `POST /auth/register`**. The
first user for dev/testing comes from a new seed script
(`seed-default-user.ts`, same idempotent pattern as
`seed-default-tenant.ts`, now both run together via `pnpm run db:seed`).
How the real first admin gets created in production (setup wizard at first
boot vs. an admin-invite flow for subsequent users) is a deliberately open
question for later in the plan, not blocking here.

## Consequences

- `apps/editor-app` requires login again (it had been running
  passwordless since Phase 2, backed by the temporary
  `StaticTenantContextAdapter`) — this was a conscious scope choice for
  this PR (confirmed with the user) over shipping the backend in isolation
  and leaving the editor broken until a follow-up integration PR.
- `libs/adapters/lucia-auth-adapter` (empty stub since Phase 0 scaffolding)
  is renamed to `libs/adapters/session-auth-adapter` and now holds the real
  implementation.
- New `libs/ports/src/lib/user-repository.port.ts` (`UserRepositoryPort`)
  and `libs/adapters/postgres-user-repository` — mirrors the existing
  `PageRepositoryPort`/`postgres-page-repository` shape.
- `apps/api/src/app/database.module.ts` is new: `PagesModule` and
  `AuthModule` both need a `KometioDb`, so the single connection pool moved
  out of `PagesModule` into a small `@Global()` module both import, instead
  of each constructing its own `postgres()` pool.
- Every project touched still clears its ADR-0009 coverage threshold (most
  at or near 100% — verified via the same sequential
  `nx run-many -t test --coverage --parallel=1` used for every prior PR).
- Verified end-to-end in a real browser (Playwright): fresh visit → login
  form, wrong password → inline error, correct password → Puck editor
  loads, page reload → session persists via cookie. Verified via `curl`
  that an unauthenticated request 401s, a valid session reaches the Pages
  API, and logout invalidates the session (post-logout requests 401 again).

## Amendment — 2026-09-29

`SessionTenantContextAdapter` and `TenantContextPort` are gone: a handler
reads the tenant and user the guard resolved as parameters, `@TenantId()`
and `@UserId()`. See [ADR-0094](0094-adapters-wired-once-deps-per-module.md).
