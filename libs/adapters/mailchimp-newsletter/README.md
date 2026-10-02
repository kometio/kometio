# mailchimp-newsletter

`NewsletterPort` implementation backed by the
[Mailchimp Marketing API](https://mailchimp.com/developer/marketing/api/).
The other of two interchangeable newsletter providers — see
[ADR-0020](../../../docs/adr/0020-form-builder-anti-spam-newsletter-attachments-multistep.md)
and its sibling [`@kometio/brevo-newsletter`](../brevo-newsletter/README.md).

## Implements

`NewsletterPort` (`libs/ports/src/lib/newsletter.port.ts`) — a single
`subscribe(email)` method, selected per deployment via `NEWSLETTER_PROVIDER`
(`apps/api`'s `createNewsletterPort`).

## How it works

Two Mailchimp-specific mechanics worth knowing before touching this file:

- **Data center from the API key.** Mailchimp API keys embed the account's
  data center as the suffix after the last `-` (e.g. a key ending `-us21`
  lives on `us21.api.mailchimp.com`) — there's no separate config value
  for it, the adapter parses it out of `MAILCHIMP_API_KEY` itself
  (`dataCenterFrom`). A key with no `-` throws immediately rather than
  silently hitting the wrong host.
- **Upsert by MD5 of the lowercased email.** The adapter `PUT`s to
  `/lists/{audienceId}/members/{md5(email.toLowerCase())}` — this is
  Mailchimp's own required member-id scheme (not a security hash), and
  `PUT`-by-id is what makes a repeat signup idempotent instead of a
  `POST`'s "Member Exists" error, matching `NewsletterPort`'s contract.

Auth is HTTP Basic with an arbitrary username (`anystring:<apiKey>` — the
username field is ignored by Mailchimp, only the password/API key
matters). A non-2xx response throws.

## Configuration

Requires `MAILCHIMP_API_KEY` and `MAILCHIMP_AUDIENCE_ID`, only enforced
once `NEWSLETTER_PROVIDER=mailchimp` is selected — see `.env.example`.
With no provider configured, `apps/api` falls back to `NoopNewsletterPort`
and this adapter never runs.

## Used by

`apps/api` — wired by `createNewsletterPort()`
(`apps/api/src/app/newsletter-port.factory.ts`), shared between the
`newsletter-consent` form field and the standalone `NewsletterSignup`
block (see `@kometio/brevo-newsletter`'s README for the best-effort vs.
propagating distinction between those two call sites).

## Running unit tests

Run `nx test mailchimp-newsletter` to execute the unit tests via [Vitest](https://vitest.dev/).
