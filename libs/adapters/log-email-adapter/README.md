# log-email-adapter

`EmailPort` implementation for a deployment with **no mail server**: it
writes each email to a log, in full, instead of sending it or failing.

## Implements

`EmailPort` (`libs/ports/src/lib/email.port.ts`) — a single
`sendEmail({ to, subject, html, text })` method.

## How it works

The emails that matter without a mail server are the ones that carry a link:
an invitation, a password reset, the confirmation of a new address. Their
`text` has the link in it, in full, so the entry is enough to follow it. The
HTML is left out.

It never throws, on purpose. A request that failed for lack of a mail server
would leave a half-done invitation behind (the person is created, the email is
not sent) and, for a password reset, would tell whoever asks which addresses
have an account. Reading the entries takes access to the server's log, the same
access the first-run setup token asks for, so a link here is no more exposed
than the database it opens.

Where an entry goes is the caller's: the constructor takes a
`write(entry: string)` function, and the API passes its own logger. The
library has no dependency on the framework.

## Configuration

None. It is what `apps/api` uses when `SMTP_HOST` is not set
(`apps/api/src/app/adapters/email.factory.ts`); with `SMTP_HOST` set it uses
[`smtp-email-adapter`](../smtp-email-adapter/README.md) as before.

## Running unit tests

Run `nx test log-email-adapter` to execute the unit tests via [Vitest](https://vitest.dev/).
