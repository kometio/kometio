# brevo-newsletter

`NewsletterPort` implementation backed by [Brevo](https://www.brevo.com/)
(formerly Sendinblue)'s contacts API. One of two interchangeable
newsletter providers built up front — see
[ADR-0020](../../../docs/adr/0020-form-builder-anti-spam-newsletter-attachments-multistep.md)
for why two adapters exist instead of one, and its sibling
[`@kometio/mailchimp-newsletter`](../mailchimp-newsletter/README.md) for the
other.

## Implements

`NewsletterPort` (`libs/ports/src/lib/newsletter.port.ts`) — a single
`subscribe(email)` method. Which provider actually runs (`brevo`,
`mailchimp`, or neither) is an env var choice per deployment
(`apps/api`'s `createNewsletterPort`), never a code fork.

## How it works

`BrevoNewsletterAdapter.subscribe` does a plain `POST` to
`https://api.brevo.com/v3/contacts` with the API key in the `api-key`
header and `updateEnabled: true` in the body. That flag is what makes a
repeat signup idempotent — Brevo updates the existing contact instead of
returning a "contact already exists" error, matching `NewsletterPort`'s
own contract that a resubmission is never an error. A non-2xx response
throws.

## Configuration

Requires `BREVO_API_KEY` and `BREVO_LIST_ID` (the numeric Brevo list to
add the contact to), both only enforced (`requireEnv`, fail loud) once
`NEWSLETTER_PROVIDER=brevo` is actually selected — see `.env.example`.
With no `NEWSLETTER_PROVIDER` set at all, `apps/api` falls back to
`NoopNewsletterPort` and this adapter never runs; newsletter is an
optional feature, unlike email/CAPTCHA.

## Used by

`apps/api` — wired by `createNewsletterPort()`
(`apps/api/src/app/newsletter-port.factory.ts`), shared between the
`newsletter-consent` form field (best-effort, swallows provider errors so
a newsletter outage never fails a contact-form submission) and the
standalone `NewsletterSignup` block (not best-effort — a provider failure
propagates, since subscribing is the entire point of that endpoint).

## Running unit tests

Run `nx test brevo-newsletter` to execute the unit tests via [Vitest](https://vitest.dev/).
