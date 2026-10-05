# altcha-captcha

`CaptchaPort` and `CaptchaChallengePort` for the captcha built into Kometio
(docs/adr/0103): [ALTCHA](https://altcha.org), a proof of work the visitor's
browser solves in the background. It needs no account and no network, which is
why a deployment with no Cloudflare keys is not left with a captcha that passes
everything.

## Implements

- `CaptchaChallengePort.createChallenge()` — a challenge signed with an HMAC,
  with an expiry (ten minutes), for the widget to solve. The widget fetches it
  from `GET /api/captcha/challenge`.
- `CaptchaPort.verify({ token })` — the token is what the widget sends back, the
  challenge and its solution as base64 JSON. `false` for anything that is not a
  solution of a challenge this deployment signed, that has not expired, and that
  has not been spent already; a missing or malformed token is a refusal, never
  an error thrown up the stack.

## How it works

PBKDF2/SHA-256, the browser's own crypto (no WebAssembly). The challenge asks the
solver to find a counter drawn from a range, and is signed together with the key
that counter leads to, so checking a solution costs one HMAC and finding it costs
about 4,000 attempts of 2,000 PBKDF2 iterations: under a second on a computer,
more on a phone. The cost is a constant here, not a setting: it is the trade
between a script that submits thousands of forms and a person who waits.

`altcha-lib` signs a challenge and checks that a solution fits it, and can be
given a store to remember the ones it accepted. This keeps them in memory (a
bounded map, oldest out first), so a solution is accepted once. A restart
forgets them and two instances would not share them; a forgotten solution is
spendable only until its challenge expires, which is accepted at the scale of
one API process, where the rate limiter is in memory too.

## Configuration

One `secret`, which signs the challenges. The API makes it from
`PREVIEW_TOKEN_SECRET` (an HMAC of a fixed label, so it is a separate key and
stable across restarts) in `createCaptcha`; a second secret, for the derived
keys, is made from it by the library.

## Used by

`apps/api`, in `createCaptcha` (`apps/api/src/app/adapters/captcha.factory.ts`),
when the deployment has no Turnstile keys; the challenge is handed out by
`CaptchaController` (`apps/api/src/app/captcha`).

## Running unit tests

Run `nx test @kometio/altcha-captcha` to execute the unit tests via
[Vitest](https://vitest.dev/).
