# smtp-email-adapter

`EmailPort` implementation over generic SMTP via
[Nodemailer](https://nodemailer.com/), used for both transactional auth
emails (verification, password reset) and form-submission notifications.

## Implements

`EmailPort` (`libs/ports/src/lib/email.port.ts`) — a single
`sendEmail({ to, subject, html, text })` method.

## How it works

Deliberately generic SMTP rather than a provider-specific SDK (SendGrid,
Postmark, etc.) — no vendor lock-in, and the exact same adapter works
against [Mailpit](https://mailpit.axllent.org/) locally (via
docker-compose, see `docs/development.md`) and any real SMTP provider in
production, with no code branch between environments. `secure` is derived
from the port (`true` only for `465`, the implicit-TLS port); `auth` is
omitted entirely when no `user`/`password` are configured, which is what
lets Mailpit work with zero credentials in local dev.

## Configuration

Requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM_ADDRESS`. `SMTP_USER`/
`SMTP_PASSWORD` are optional — Mailpit needs neither. See
`.env.example` (defaults to `localhost:1025` for local Mailpit).

## Used by

`apps/api` — wired as `EMAIL_PORT` in `AuthModule`
(`apps/api/src/app/auth/auth.module.ts`, for verification/password-reset
emails) and independently constructed in `PublicFormsModule`
(`apps/api/src/app/public-forms/public-forms.module.ts`, for form
submission notifications).

## Running unit tests

Run `nx test smtp-email-adapter` to execute the unit tests via [Vitest](https://vitest.dev/).
