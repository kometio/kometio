# 0137 — The sign-in can ask for a second step

**Status**: Accepted — 2026-10-14.

## Context

An administrator's password is the one thing between the internet and every
page, every account and the site's settings. Passwords are reused, phished and
leaked, and the agency that puts a client's site on Kometio is asked, sooner
or later, whether the editor has two-step verification (SEC-6). It was the one
security feature the product was missing before a first customer.

This ADR is about the second step only: a code from an authenticator app. It
does not give the roles any new power (docs/roles.md), and it is not
permissions per section, which was considered and left out of the beta.

## Decision

- **TOTP, RFC 6238.** SHA-1, six digits, thirty seconds: the one combination
  every authenticator app supports. A step either side of the current one is
  accepted, since two clocks are never quite together.
- **Optional, per account.** A person turns it on from Account → Security;
  nothing forces it, and an administrator cannot turn it on for somebody
  else (the secret has to reach that person's phone, not the administrator's
  screen). Requiring it for the administrator role is a separate decision that
  this makes possible.
- **A person who has it on gets no session from the password.** `POST
/auth/login` answers `{ secondFactorRequired, challenge }` and sets no
  cookie; `POST /auth/login/second-factor` takes the challenge and a code and
  makes the session. Nothing about the second step is said to someone with the
  wrong password.
- **The challenge is a one-time token** (`verification_tokens`, purpose
  `second-factor`, five minutes). It says who is being asked, lives in the
  database, is spent when it is read, and so is neither replayed nor kept by a
  client. It needed no new mechanism and no signing key.
- **A wrong code is a try, and the tries are counted in the challenge.** The
  refusal hands back a fresh challenge carrying the count (its `payload`), up
  to five; after that the person begins again from the password, which has its
  own throttle and captcha. A typo costs a try, not a trip back to the
  password.
- **A code is good once.** The last accepted step is kept per person and moved
  forward in the same statement that checks it, so a code read over a shoulder,
  or from a log, or sent twice at once, is refused (RFC 6238 §5.2).
- **The secret is sealed with the server's key**, the one that seals the AI
  provider's API key (`SecretCipherPort`, ADR-0092). A dump of the database
  opens nothing. Where the deployment has nowhere to keep that key — neither
  `KOMETIO_SECRETS_DIR` nor `KOMETIO_SECRETS_KEY` — the second step is not
  offered at all, and the editor draws nothing: both production topologies
  have one.
- **Ten recovery codes**, made when it is turned on, each good once, stored as
  a SHA-256 of fifty random bits (there is nothing to slow down). They are the
  way back in for a person who lost the app, and they do not need the key:
  with the secrets volume replaced, a recovery code still works, and so does an
  administrator's reset. They are shown once, can be downloaded as a file, and
  can be made again with the password.
- **The password is asked again** for everything that begins, replaces or
  removes a way in: turning it on, new recovery codes, turning it off. A
  session left open is not enough. Those routes are counted per person like
  the other routes that ask for the password.
- **It is switched on by the first code that fits, not by the secret.** A
  secret that never reached an app would otherwise lock the person out at the
  next sign-in. The dialog is three steps (password; secret and first code;
  recovery codes) and closing it anywhere before the second leaves the account
  as it was.
- **Other sessions end** when it is turned on or off, and all of a person's
  sessions end when an administrator resets it: a second step that left a
  stolen session signed in would not be one.
- **An administrator can take it off another person** (`POST
/users/:id/second-factor/reset`, `configureSite`), for a person who has
  lost the app and the codes. It is in the activity log with the person it was
  done to, and the person signs in with the password and turns it on again.
- **The activity log says it** (`account.two_factor_enabled`,
  `account.two_factor_disabled`, `account.recovery_code_used`,
  `account.two_factor_reset`), and a refused code is a refused sign-in with the
  reason `second-factor`.
- **The TOTP is written here**, in `@kometio/totp-authenticator`, with
  `node:crypto` and the RFC's own test vectors in its spec. A second-factor
  dependency is one more place a supply-chain compromise would sit exactly
  where it is worth the most, and it is forty lines. The one dependency this
  adds is `qrcode-generator` in the editor, for the picture of the secret: it
  draws the modules, and the editor draws them as an SVG path.
- **It does not travel in a site archive.** The secrets are sealed with a key
  of the server they were made on, so on another one they would be rows that
  cannot be read and that lock the person out. `user_second_factors` and
  `user_recovery_codes` are transient tables: an imported site starts with the
  second step off, and the archive's manifest and the README say so.
- **Not in a demo.** The account of a demo is everybody's; the routes are
  under `/account`, which a demo refuses (ADR-0118).

## What this does not do

- **No passkeys, no SMS, no email codes.** `user_second_factors.kind` is text
  so that a second kind is a line and not a migration, and nothing else is
  built for it.
- **No "remember this device".** Every sign-in asks. A person with two-step
  verification on is signed in for thirty days like anybody else, so it is
  asked once a month, not once a day.
- **No forced enrolment, and no policy by role.**
- **No recovery from losing everything on a server with one administrator.**
  The person who runs the server can: the rows are `user_second_factors` and
  `user_recovery_codes` (delete the person's), documented in
  docs/self-hosting.md. A command for it in the launcher is the obvious next
  step.
- **No limit per address on the second step beyond the API's default.** The
  count that matters is per challenge, and a challenge needs the password and
  its captcha.

## Consequences

- `loginUser` answers a union (`signed-in` or `second-factor-required`); its
  callers read the status.
- Migration 0015 adds two tables and a value to the token-purpose enum.
- Losing the secrets key turns every authenticator secret unreadable: those
  people use a recovery code, or an administrator resets them. It loses the AI
  key as before, and nothing else.
