# 0103 — A server can run without a mail server and without Cloudflare

**Status**: Accepted — 2026-10-05

## Context

In production the API refused to start without an SMTP server and without a
site's own Cloudflare Turnstile keys, and refused Cloudflare's test keys. That
is two accounts with two outside companies before the first run on a server,
and it was the highest barrier left for the freelancer or agency we want to
have try Kometio on a real machine.

The trial image hid the problem rather than solving it: it pointed SMTP at a
port nothing listens on and used Cloudflare's test secret. That had costs of
its own, found on the way:

- **Inviting a person failed with a 500 after the person had been created**:
  the invitation row and its token are written first, then the email is sent,
  and the send threw. The administrator saw an error and the person was
  already there, pending, with a link nobody could get.
- **A password reset answered 500 for an address that has an account and 204
  for one that has not.** The use case promises the caller can never tell the
  two apart, and it keeps that promise right up to the moment the mail server
  fails. A deployment with a wrong `SMTP_HOST` handed out that answer to anyone.
- **The login needs Cloudflare's script from the internet**, even in the
  trial, so a machine with no route to it has a login button that never
  enables.

## Decision

- **Mail is optional.** Without `SMTP_HOST` the API starts and each email is
  written to its log, in full, link included, by `LogEmailAdapter`
  (`libs/adapters/log-email-adapter`, behind `EmailPort`). With `SMTP_HOST` set,
  `SMTP_PORT` and `SMTP_FROM_ADDRESS` are required. An empty value is "not
  set", as an example file leaves it (the schema had refused the empty string,
  so a copied `.env.example` did not start; this holds for
  `PUBLIC_API_SERVICE_TOKEN` too). Whoever reads the log is whoever runs the
  server, with the same trust the first-run setup token already asks for.
- **It does not throw.** An adapter that fails for lack of a mail server would
  bring back the 500 and the half-made invitation. The editor tells the
  administrator what is happening (the notice, and the setup checklist), so a
  quiet log is not mistaken for a working mail server.
- **A password reset never reports the delivery.** Whether or not the email
  could be sent, it answers as it does for an address with no account; the
  failure goes to the log. This is a security fix, not a convenience, and holds
  for a real mail server that is down as well.
- **The captcha is Turnstile when the site's keys are given, and a challenge
  built into Kometio when they are not.** The built-in one is ALTCHA: a
  proof-of-work, so it needs no account and no network, and its widget is
  accessible and translated. The server side is `altcha-lib` (challenges signed
  with an HMAC and expiring), plus what the library does not do, a solution
  that cannot be used twice. The widget is the library's "external" build
  (about 83 KB minified) with its worker served from our own origin, which
  keeps `script-src 'self'` as it is; the default algorithm (`PBKDF2/SHA-256`)
  uses the browser's own crypto and needs no WebAssembly. The trial then has a
  real captcha instead of one that passes everything. Chosen over writing our
  own, and over keeping the captcha switched off with a warning: a server on the
  internet with the login and the public forms open to bots is not a
  deployment to hand to somebody who has not seen the product yet.

## Consequences

- A first server needs no SMTP account and no Cloudflare account. `DOMAIN`
  and the three addresses are what it asks for.
- Without a mail server, an invitation or a reset is followed from the log
  (`docker logs`, `docker compose logs api`). That is clumsy for a team and fine
  for the one person who sets up a site; showing the invitation link to the
  administrator who invites is a later step, and a reset link is never shown to
  the person who asked for it (it would hand an account to anyone who knows an
  address).
- The remaining difference between a known and an unknown address in a
  password reset is time (a lookup and a token against a lookup), which this
  does not remove.
- The editor and the public site have to agree on which captcha is in use. The
  rule is the same for both: Turnstile when its keys are there, the built-in
  one when they are not.
- **What this change does and what follows it.** The mail half, the reset fix
  and the notice come first; the server side of the built-in captcha and its
  widget in the editor come next; the public site's forms and newsletter last.
  Until the captcha half lands, the production image still asks for Turnstile
  keys.
