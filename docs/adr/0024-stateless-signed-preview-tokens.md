# 0024 — Stateless signed preview tokens, replacing the DB-backed opaque ones

**Status**: Accepted — 2026-08-27

## Context

Security review 2026-08-24 (database section) flagged three tables with
`expires_at` declared but never enforced at the row level:
`sessions`, `verification_tokens`, `content_preview_tokens`. The first two
self-clean partially on their own read path — `SessionAuthAdapter`
deletes a session the moment an expired token is presented again;
`VerificationTokenAdapter.consumeToken` deletes atomically on successful
use — but a session whose cookie is simply abandoned, or an invite/reset
link never clicked, still leaves an orphan row forever.

`content_preview_tokens` was worse, by design: `PreviewTokenAdapter`'s own
comment said it plainly — "non-consumante... una sessione di preview
ricarica l'iframe più volte" (non-consuming: a preview session reloads the
iframe multiple times). `validateToken` never deleted a row, ever. Every
canvas mount (`canvas-frame.tsx`) and every "Visualizza pagina" click
(`canvas-editor-shell.tsx`) calls `createPagePreviewToken`, which inserts
a brand new row — this was, by a wide margin, the fastest-growing of the
three tables, with zero cleanup mechanism of any kind.

The obvious fix — a scheduled cleanup job — works for `sessions`/
`verification_tokens` (see the sibling decision below, the
`ExpiredTokensCleanupService` cron), but only _bounds_ the growth to
roughly one cleanup interval's worth of rows; it doesn't address why
`content_preview_tokens` needs a database row at all. Unlike sessions and
verification tokens, a preview token has neither of the two properties
that justify a DB-backed opaque token:

- **No early revocation need.** Deactivating a user must kill their
  sessions immediately (`invalidateAllSessionsForUser`, already wired
  through `SetUserActive`) — a preview token has no equivalent "kill it
  now" scenario; it lives at most an hour, scoped to one editor's own
  browser tab.
- **No single-use requirement.** `VerificationTokenPort.consumeToken`
  deletes on first use specifically to stop replay of a password-reset or
  invite link — a preview token is reloaded by the same iframe repeatedly
  on purpose; single-use would break the feature outright.

## Decision

`PreviewTokenAdapter` (`libs/adapters/preview-token-adapter`) no longer
touches Postgres at all. `createToken` builds a JSON payload
(`tenantId`, `contentType`, `contentId`, `expiresAt`), base64url-encodes
it, and signs it with HMAC-SHA256 using a secret
(`PREVIEW_TOKEN_SECRET`, new required env var) — the token is
`${payloadB64}.${signature}`, the same two-part shape as a JWT without
pulling in a JWT library for one narrow use. `validateToken` recomputes
the signature (`timingSafeEqual`, not `===`), decodes the payload, and
checks `contentType`/`contentId`/`expiresAt` against what the caller
asked for. No database round-trip, no row to clean up — ever, by
construction, rather than by a cron job holding the line.

**Trade-off accepted explicitly**: the payload is signed, not encrypted —
`tenantId`/`contentType`/`contentId` are readable by anyone holding the
token (trivial base64 decode), just not forgeable without the secret.
Judged acceptable because `tenantId` is not treated as a secret anywhere
else in this single-tenant-per-deployment product (ADR 0006), and holding
a valid token for one `contentId` already implies the holder is the
authorized editor iframe for exactly that content — there is nothing a
plaintext-payload reader learns that they didn't already have.

`content_preview_tokens` is dropped entirely (migration `0029`), not
left in place unused — nothing writes to it anymore.

## Consequences

- `PreviewTokenAdapter`'s constructor changes from `(db, tenantId)` to
  `(secret)` — the four call sites that construct it
  (`pages.module.ts`, `site-layout-sections.module.ts`,
  `public-pages.module.ts`, `public-site-layout-sections.module.ts`) now
  inject `requireEnv('PREVIEW_TOKEN_SECRET')` instead of `DATABASE`/
  `DEFAULT_TENANT_ID` — two of those modules' `DEFAULT_TENANT_ID`
  provider became entirely dead code as a result and were removed rather
  than left unused.
- The package's own dependencies shrink to `@kometio/domain-core` +
  `@kometio/ports` — no more `@kometio/postgres-db`, `@kometio/opaque-token`,
  or `drizzle-orm`. Its test suite changed from a Postgres-backed
  integration spec to a pure unit spec (no DB needed to validate
  signature/expiry/tamper logic).
- A leaked `PREVIEW_TOKEN_SECRET` lets an attacker forge a token for any
  `(contentType, contentId)` in the deployment, i.e. view any draft
  content — no write access, no session/account compromise. Documented
  in `.env.example` as a value a real deployment must generate for
  itself (`openssl rand -hex 32`), not left at its dev placeholder.
- Verified live end-to-end (real login, real token creation, request
  through the public preview endpoint): a valid token returns the page,
  a single-byte-tampered token is rejected with 404, and reusing the same
  token a second time still succeeds (the non-consuming property is
  preserved).

## Related: `sessions`/`verification_tokens` keep their DB-backed design

Discussed and decided in the same pass as the above, but _not_ changed:
`sessions` and `verification_tokens` stay exactly as they are — DB-backed
opaque tokens, hashed at rest (`@kometio/opaque-token`) — precisely because
they _do_ need early revocation and single-use respectively, the two
properties a stateless signed token can't provide (see Context above).
Their unbounded growth is addressed differently: a new
`ExpiredTokensCleanupService` (`apps/api/src/app/maintenance`), a daily
`@nestjs/schedule` cron job, deletes rows past `expires_at` via a
`deleteExpiredTokens` function in `@kometio/postgres-db` (kept there, not
in `apps/api`, so the API layer never needs to import `drizzle-orm`
directly — it hadn't, anywhere else, until now, and shouldn't start for
this one job).

`@nestjs/schedule@12` turned out to be ESM-only (`"type": "module"`,
no CJS build) and broke `apps/api`'s Jest-based test run outright
(`SyntaxError: Unexpected token 'export'`) — `apps/api` is the one
project in this monorepo still on Jest rather than Vitest. Pinned to
`@nestjs/schedule@6.1.3` instead, the last major line that both still
ships a CJS build and declares `@nestjs/core: ^10.0.0 || ^11.0.0` as a
compatible peer.
