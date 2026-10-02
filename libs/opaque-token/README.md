# opaque-token

Two tiny, dependency-free functions — `generateOpaqueToken()` and
`hashOpaqueToken()` — implementing the "random token, store only its hash"
mechanic shared by every credential-like token in this codebase: login
sessions and email-verification/password-reset/invite tokens (see
[ADR-0011](../../docs/adr/0011-email-verification-password-reset.md)).

## How it works

- `generateOpaqueToken()` returns 32 cryptographically random bytes
  (`node:crypto`'s `randomBytes`), base64url-encoded. This is the value
  handed to the client (as a session cookie or a link's query param) — it
  carries no information about the user or its purpose, it's "opaque".
- `hashOpaqueToken()` runs the token through plain SHA-256 before it's
  persisted. Only the hash is ever written to the database; the plaintext
  token exists only in memory and on the wire to the client.

SHA-256, not argon2: the token is already maximum-entropy and random, so
there's no dictionary/brute-force surface to slow down the way a
human-chosen password needs — the deliberate slowness argon2 buys you would
just be wasted CPU on every session/token lookup. If the database leaks, an
attacker gets hashes that don't yield usable tokens back; they aren't
protecting against a guessable input the way a password hash is.

## Used by

Not imported directly by any app — it's a small building block consumed by
two adapters in `libs/adapters`:

- `session-auth-adapter` (login sessions)
- `verification-token-adapter` (email verification, password reset, user
  invites)

Both adapters implement a Port from `libs/ports` (`AuthPort`'s session
methods and `VerificationTokenPort` respectively) using this same
generate/hash pair, so the two token kinds stay consistent without either
adapter reimplementing the mechanic.

## Running unit tests

Run `nx test opaque-token` to execute the unit tests via [Vitest](https://vitest.dev/).
