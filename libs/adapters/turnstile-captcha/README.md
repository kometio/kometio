# turnstile-captcha

`CaptchaPort` implementation backed by
[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/).
See
[ADR-0020](../../../docs/adr/0020-form-builder-anti-spam-newsletter-attachments-multistep.md)
for the anti-spam design this sits inside (Turnstile on top of the
existing honeypot, not instead of it).

## Implements

`CaptchaPort` (`libs/ports/src/lib/captcha.port.ts`) — a single
`verify({ token, remoteIp? })` method returning a boolean. A `false`
result means "reject the submission with a visible error" — unlike the
honeypot check ([ADR-0015](../../../docs/adr/0015-form-builder-architecture.md)),
which discards silently, a failed CAPTCHA can be a real visitor with an
expired/blocked token, so they get a chance to retry rather than a fake
success.

## How it works

Posts the widget's response token to Cloudflare's `siteverify` endpoint
(`https://challenges.cloudflare.com/turnstile/v0/siteverify`) along with
the secret key and, when available, the submitter's IP. A missing/empty
token is treated as an automatic fail **without a network call** — same
short-circuit reasoning as the honeypot check, just applied to a
different signal. A non-2xx HTTP response is also treated as a fail
(fail-closed), not an error thrown up the stack.

**Turnstile tokens are single-use** — a second `verify()` call against
the same token fails even if the first one succeeded. This is why the
form-builder flow (ADR-0020) runs the honeypot check first (cheap, no
network call) and only calls `CaptchaPort.verify()` once, immediately
before accepting the final submission — an attachment-upload endpoint
can't re-verify the same CAPTCHA token independently.

Chosen over reCAPTCHA/hCaptcha specifically for its GDPR posture: not
being a Google product sidesteps the same click-to-load consent question
already solved elsewhere for Maps/YouTube embeds, rather than reopening
it for this widget too.

## Configuration

Used when `TURNSTILE_SECRET_KEY` is set (server-side verification secret —
never exposed to the browser), which the API's schema requires together with
`TURNSTILE_SITE_KEY`: both or neither. The paired `TURNSTILE_SITE_KEY`/
`VITE_TURNSTILE_SITE_KEY` are client-side and consumed by the frontends,
not this adapter. `.env.example` defaults to Cloudflare's official
"always pass, visibly marked test-only" key pair, so local dev and CI
never depend on a real Cloudflare account.

## Used by

`apps/api`, in `createCaptcha` (`apps/api/src/app/adapters/captcha.factory.ts`),
which answers `CAPTCHA_PORT` for every module that checks a captcha (login,
password reset, the public forms and the newsletter). It is the one used when
the deployment has both Turnstile keys; with neither, the captcha is the one in
[altcha-captcha](../altcha-captcha/README.md) (docs/adr/0103).

## Running unit tests

Run `nx test turnstile-captcha` to execute the unit tests via [Vitest](https://vitest.dev/).
