# preview-token-adapter

`PreviewTokenPort` implementation: **stateless**, HMAC-signed tokens for
the editor's live-preview iframe. See
[ADR-0024](../../../docs/adr/0024-stateless-signed-preview-tokens.md) for
the full rationale — this adapter is deliberately built differently from
its DB-backed cousins (`@kometio/session-auth-adapter`,
`@kometio/verification-token-adapter`).

## Implements

`PreviewTokenPort` (`libs/ports/src/lib/preview-token.port.ts`) —
`createToken(tenantId, contentType, contentId, ttlMs)` and
`validateToken(token, contentType, contentId)`.

## How it works

Unlike sessions and verification tokens, a preview token carries its own
payload rather than being a lookup key into a database table:

- `createToken` JSON-encodes `{ tenantId, contentType, contentId,
expiresAt }`, base64url-encodes it, and appends an HMAC-SHA256 signature
  (keyed by the adapter's `secret`) over the encoded payload, joined by a
  `.`: `<payloadB64>.<signature>`.
- `validateToken` recomputes the signature and compares it with
  `timingSafeEqual` (constant-time, to avoid a timing side-channel on the
  signature check), then decodes the payload and checks it matches the
  requested `contentType`/`contentId` and hasn't expired. No database
  query at all — validation is pure computation.

This has no persisted row to create, expire, or clean up — deliberately:
the token's predecessor was a `content_preview_tokens` table that had no
cleanup mechanism and was the fastest-growing table found in the
2026-08-24 security review. Being stateless also means **validating a
token never invalidates it** (unlike `VerificationTokenPort.consumeToken`,
which is single-use) — the editor canvas reloads the same preview iframe
many times against the same token, so a preview session must survive
repeated validation.

**Security note**: the payload is signed but not encrypted —
`tenantId`/`contentType`/`contentId` are readable by anyone holding the
token (plain base64url decode), just not forgeable without the secret.
Accepted as fine here: `tenantId` isn't treated as a secret elsewhere in
this codebase (single-tenant-per-deployment, ADR-0010), and whoever holds
the token is, by construction, already the iframe authorized to see
exactly that `contentId`.

Also unlike the DB-backed tokens, there's no early-revocation path — a
minted preview token is valid until it expires, full stop. Acceptable
because a preview link lives for a short, fixed TTL and only within the
same browser session as the editor that requested it, not something that
needs to be revocable on demand.

## Configuration

Requires `PREVIEW_TOKEN_SECRET` (the HMAC signing key) — see
`.env.example`. The TTL itself is a caller-side policy decision, not
adapter config: `apps/api` currently uses a shared one-hour constant
(`PREVIEW_TOKEN_TTL_MS`, `apps/api/src/app/preview-token-ttl.constant.ts`)
for both pages and site-layout-sections previews.

## Used by

`apps/api` — instantiated independently (new `PreviewTokenAdapter(secret)`,
no shared provider token) in four modules: `pages.module.ts`,
`site-layout-sections.module.ts`, `public-pages.module.ts`, and
`public-site-layout-sections.module.ts` — the first two mint tokens for
the authenticated editor, the latter two validate them on the
unauthenticated public preview endpoints the editor iframe actually loads.

## Running unit tests

Run `nx test preview-token-adapter` to execute the unit tests via [Vitest](https://vitest.dev/).
