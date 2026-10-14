# @kometio/totp-authenticator

The `TotpPort` adapter: the second factor of a sign-in. A code an
authenticator app makes from a secret both sides hold and the time
(RFC 6238): SHA-1, six digits, thirty seconds — the one combination every
authenticator app supports.

It holds nothing and stores nothing. Where the secret is kept (sealed, in
the database) is `SecondFactorRepositoryPort`'s, and what happens with a
code that fits is the use cases' (`docs/adr/0137`).

## Why it is written here

`node:crypto` and forty lines, with the RFC's own test vectors in the spec.
A second-factor dependency is one more place a supply-chain compromise
would sit exactly where it is worth the most, and the code does nothing a
package would do better.

## What it checks

- A code is six digits (spaces in the middle are ignored, as an app prints
  them in two groups of three).
- The step before and the step after the current one are accepted: two
  clocks are never quite together.
- A code is good once: `notBeforeStep` is the step after the last one that
  was accepted, so a code that was just used is refused for the rest of its
  thirty seconds (RFC 6238 §5.2).
- Every candidate step is computed and compared in constant time whether or
  not an earlier one matched.

## Running unit tests

Run `nx test @kometio/totp-authenticator`.
