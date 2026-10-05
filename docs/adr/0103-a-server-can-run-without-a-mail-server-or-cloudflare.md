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
  person what is happening, so a quiet log is not mistaken for a working mail
  server: a notice on the Users screen, in the invite dialog and on the
  forgot-password screen (from `GET /api/deployment`, which says whether the
  server has a mail server), and confirmations that say "no email was sent"
  where they would have said "sent" (an invitation, sending it again, a request
  to change one's address, a password reset).
- **That answer is open to anyone.** The first place it is needed is the
  forgot-password screen, before there is a session: a person who has forgotten
  their password on a server with no mail server is told that no email will
  come, instead of waiting for one. It is throttled like the other public
  routes, and the record may hold only what is fit for anyone to read and the
  same for every address: one fact about the server, never about an account.
- **An invitation reports its email to the administrator.** The person is
  invited, and the link works, whether or not a configured mail server took
  the message; the answer says which (`emailSent`) and the editor says "invited,
  but the email could not be sent: use Resend invite once the mail server
  works". It used to fail with a 500 after the person was made, and the next
  try was refused because the address was taken. A reset hides the failure
  because showing it would say which addresses have an account; an invitation is
  the administrator's own action on a person they named, so there is nothing to
  hide, and the failure is the thing they need to know. Sending an invitation
  again answers the same way. The log gets the reason in every case.
- **A password reset never reports the delivery.** Whether or not the email
  could be sent, it answers as it does for an address with no account; the
  failure goes to the log. This is a security fix, not a convenience, and holds
  for a real mail server that is down as well.
- **The captcha is Turnstile when the site's keys are given, and a challenge
  built into Kometio when they are not.** Both of `TURNSTILE_SITE_KEY` and
  `TURNSTILE_SECRET_KEY`, or neither: one alone is refused at start-up, because
  the widget and the verifier would be on different captchas. The built-in one
  is ALTCHA, a proof of work, so it needs no account and no network, and its
  widget is accessible and translated. Chosen over writing our own, and over
  keeping the captcha switched off with a warning: a server on the internet with
  the login and the public forms open to bots is not a deployment to hand to
  somebody who has not seen the product yet.
  - **Server side** (`libs/adapters/altcha-captcha`, `altcha-lib`): challenges
    signed with an HMAC, expiring after ten minutes, PBKDF2/SHA-256 (the
    browser's own crypto, no WebAssembly), a counter drawn from a range so that
    checking a solution is one HMAC and finding it is about a second of work. The
    secret is made from `PREVIEW_TOKEN_SECRET`, which every deployment has: a
    second secret would be one more thing the first run asks for. A solution is
    accepted once: the library can be given a store of the ones it accepted, and
    ours is a bounded map in memory, as the API's rate limiter is. A restart
    forgets it and two instances would not share it, which is accepted at the
    scale of one process.
  - **`GET /api/captcha/challenge`** hands out a challenge to anyone, throttled,
    never cached; it answers 404 on a deployment that uses Turnstile.
  - **The widget** is the library's "external" build, which is what a policy of
    `script-src 'self'` asks for, loaded only when a form that needs it is drawn,
    with its worker served from the editor's own origin. The editor's policy
    needed no change: a worker falls back to `script-src`, and the challenge is
    fetched from the API origin it already allows. It is drawn in the editor's
    own colours, not the widget's, whose `light-dark()` palette follows the
    system and not the editor's switch.
  - **The same rule in the editor and the API.** The editor reads the site key it
    already received at start-up: with one, Turnstile; without, the built-in
    widget. It used to fall back to Cloudflare's test key, a captcha that passes
    everybody, and no longer does.

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
- **What is done and what follows.** The mail half, the reset fix and the
  notices are in; so are the server side of the built-in captcha and its widget
  in the editor (the login and the forgotten-password screen). The public site's
  forms and newsletter come last: until they do, a site that wants to receive
  form submissions gives both Turnstile keys, and a keyless installation's forms
  render no widget.
