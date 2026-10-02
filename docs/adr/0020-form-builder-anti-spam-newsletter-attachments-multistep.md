# 0020 — Form builder extensions: anti-spam, newsletter, file attachments, multi-step

**Status**: Accepted — 2026-08-20

## Context

Four related extensions to the form builder (ADR-0015), scoped and built
together as one backlog batch: real anti-spam beyond the honeypot, an
opt-in newsletter subscription path, file-upload fields, and multi-step
forms. Bundled into one ADR rather than four — all four extend the same
subsystem, were decided in the same conversation, and several of the
decisions below only make sense in light of each other (most notably the
CAPTCHA/attachment interaction).

## Decision

### Anti-spam: `CaptchaPort` (Cloudflare Turnstile), on top of the honeypot — not instead of it

The honeypot (ADR-0015) silently accepts and discards; a failed CAPTCHA
check is a visible rejection instead
(`InvalidCaptchaError`, `libs/domain-core/src/lib/errors.ts`) — a real
visitor with an expired or blocked token deserves a chance to retry, so
`SubmitFormUseCase` runs the honeypot check **first** (cheapest check,
silent discard needs no network call) and only calls
`CaptchaPort.verify()` if the honeypot passes. `@kometio/turnstile-captcha`
posts the widget's response token to Cloudflare's
`siteverify` endpoint; `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` default
to Cloudflare's official "always pass, visibly marked test-only" keys in
`.env.example` and in CI, so local dev and CI never depend on a real
Cloudflare account.

**Consequence that shaped the file-upload design below**: a Turnstile
token is single-use — a second `verify()` call against the same token
fails even if the first one succeeded. This rules out re-verifying CAPTCHA
on the attachment-upload endpoint (see below), since the same token also
has to validate the final form submission moments later.

### Newsletter: a swappable `NewsletterPort`, subscription is best-effort inside a form but not from the standalone block

`NewsletterPort.subscribe(email)` is implemented by both
`@kometio/mailchimp-newsletter` and `@kometio/brevo-newsletter` (env var
`NEWSLETTER_PROVIDER` picks one — `apps/api`'s `createNewsletterPort()` —
never a code fork), built as two adapters up front rather than one,
because the user's own framing was "we'll likely add more providers
later" — the same reasoning already applied to `MediaStoragePort`'s
LocalDisk/S3 split. Both adapters upsert (`updateEnabled: true` for
Brevo, a keyed `PUT` for Mailchimp) so a repeat signup is never an error.
`NoopNewsletterPort` is the default with no provider configured — this is
an optional feature, unlike CAPTCHA, so a deployment that never sets
`NEWSLETTER_PROVIDER` must keep booting exactly as before.

Two placement options were on the table — a checkbox field inside an
existing form, or a dedicated standalone block — and the user chose both,
rather than picking one:

- **`newsletter-consent`** is a new form field type that behaves exactly
  like `checkbox` for validation/rendering (`isCheckboxLike()` in
  `submit-form.use-case.ts`). If checked, `SubmitFormUseCase`
  best-effort-subscribes the submission's email field _after_ saving the
  submission and sending the notification, wrapped in a swallowed
  try/catch — a newsletter provider outage must never fail someone's
  contact-form submission.
- **`NewsletterSignup`** (new standalone Puck block +
  `POST /public/newsletter/subscribe`, no `form_submissions` row at all)
  is deliberately **not** best-effort — `subscribe-newsletter.use-case.ts`
  lets a provider failure propagate, since subscribing is the entire
  point of that block; swallowing the error there would silently lie to
  the visitor about whether they're actually subscribed.

### File attachments: a new `AttachmentStoragePort`, not a reuse of `MediaStoragePort`

Checked before assuming: `MediaStoragePort`'s existing adapters
(`LocalDiskMediaStorageAdapter`/`S3MediaStorageAdapter`, ADR-0013)
unconditionally convert every upload to WebP and throw
`UnsupportedMediaTypeError` for anything that isn't `image/*` — a CV/PDF
attached to a contact form would be rejected outright, not just
mishandled. Presented to the user as a choice between extending
`MediaStoragePort` to tolerate non-images and a dedicated new port; the
user picked the dedicated port.

`AttachmentStoragePort.upload({filename, mimeType, data})` does no image
processing and has no `getUrl`/`delete` — nothing needs to re-resolve a
stored key later, unlike the curated media library. Its two adapters
(`@kometio/local-disk-attachment-storage`, `@kometio/s3-attachment-storage`)
deliberately **reuse** `MediaStoragePort`'s own env vars
(`MEDIA_STORAGE_PROVIDER`, `MEDIA_UPLOAD_DIR`, `API_PUBLIC_URL`,
`S3_MEDIA_*`) — same underlying storage infrastructure choice per
deployment, just a different concern, kept apart from media only by an
`attachments/` key prefix. Zero new env vars needed for this feature.

> **Amended 2026-09-29.** An attachment is stored under its form
> (`attachments/<formId>/<uuid>.<extension>`), and the port gained
> `urlPrefixFor(formId)`. A submission's file answer comes back from the
> visitor's browser, so `submitForm` accepts it only when it is one
> uuid-named file under that form's prefix. Before, any `{ url, filename }`
> went through, and a link of the visitor's choosing reached the site
> owner's notification email. Every other answer is checked against its
> field's type too (`formFieldValueSchema` in `@kometio/shared-types`).
>
> Nothing removed an attachment before: an upload whose form was never
> sent stayed, and so did the CV of a submission deleted by the site's
> retention, past the date the site promised. A job at 5 AM, an hour
> after the retention job, now deletes every stored attachment older
> than a day that no submission names, compared by stored path so a
> change of address does not make every file look abandoned
> (`sweepFormAttachments`). A form also takes at most 100 uploads a day
> (`AttachmentQuotaGuard`), from every address together.

A new `POST /public/forms/:id/attachments` endpoint
(`public-forms.controller.ts`, `FileInterceptor` + `memoryStorage()`, 10MB
cap) uploads a file ahead of the main JSON submission — deliberately does
**not** re-check the CAPTCHA token, per the single-use constraint above;
`ThrottlerGuard` is this endpoint's only abuse protection. The
public-site submit proxy (`apps/public-site/src/pages/api/forms/[id]/
submit.ts`) calls this endpoint server-side for any `File` field with
`size > 0` before assembling the main submission JSON, storing
`{url, filename}` (validated by `formFieldFileValueSchema`) as that
field's value — a `File` isn't JSON-serializable, so this has to happen
before the JSON POST, not as part of it.

### Multi-step forms: fields stay flat, `steps` is additive, a form with no steps is unchanged

Considered restructuring `fields` into a nested per-step array; rejected
in favor of keeping the existing flat `fields: FormField[]` untouched and
adding an optional `stepId: string | null` per field plus a sibling
`steps: {id, title}[]` on the `Form` entity — zero migration needed for
every form that predates this feature, and `isMultiStep` is computed
**only** from `form.steps.length > 0`, never from whether any field
happens to carry a stray `stepId` (e.g. left over after its step was
deleted) — a form with an empty `steps` array must always render as a
single flat page, by construction, not by convention that could later be
violated by leftover data.

Step navigation is vanilla JS in `Form.astro` (ADR-0007's Puck-independent
rendering, same "no framework" precedent as the site's other interactive
blocks) — every step's markup stays in the DOM for the whole session (all
fields still submit together in one POST at the end); only the current
step is toggled via the `hidden` attribute. Two bugs surfaced only by
driving the real page in a browser, not by unit tests:

- **Enter key mid-wizard**: pressing Enter in a text field fires a real
  `submit` event on the form regardless of the (possibly `hidden`) submit
  button's own hidden state. Intercepted via the form's own `submit`
  listener — `preventDefault()` and advance a step instead, unless
  already on the last step.
- **`[hidden]` silently overridden**: `.kometio-form__step { display: flex
}` (an author-stylesheet rule) beats the browser's built-in `[hidden] {
display: none }` UA rule regardless of selector specificity, since
  author rules always win over UA rules. Fixed with an explicit
  `.kometio-form__step[hidden] { display: none; }` rule.

Each step's fields are validated (native `reportValidity()`) before
advancing past them — required fields on an earlier, now-hidden step are
otherwise exempt from HTML5 constraint validation at the final submit,
since browsers skip validating anything inside a hidden element.

## Consequences

- `forms` gains a `steps jsonb not null default '[]'` column (migration
  `0018`); `FormField` gains an optional `stepId`. Every existing form
  keeps working with zero data migration.
- New env vars requiring both `.env`/`.env.example` **and**
  `.github/workflows/ci.yml`'s `main` job `env:` block:
  `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (required, safe public test
  values), `NEWSLETTER_PROVIDER` (optional, unset in CI/local by default).
  This split — `.env.example` documents, `ci.yml` provisions, CI reads
  neither `.env` file at all — cost a broken pipeline once during this
  batch (Turnstile shipped in CI-red before the `ci.yml` env block was
  updated); worth restating here since it's easy to repeat.
- Four adapter libs added: `@kometio/turnstile-captcha`,
  `@kometio/mailchimp-newsletter`, `@kometio/brevo-newsletter`,
  `@kometio/local-disk-attachment-storage`, `@kometio/s3-attachment-storage`
  (five, not four — attachments split local/S3 same as media).
- `AttachmentStoragePort`'s "no re-verify CAPTCHA on upload" only holds
  because the upload endpoint requires the same session/submission flow
  as the main POST moments later. A future attachment-upload use case
  decoupled from an imminent form submission would need its own
  abuse-protection story, not inherit this one by assumption.
