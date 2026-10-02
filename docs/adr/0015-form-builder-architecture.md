# 0015 — Form builder: entity, field propagation, and scope

**Status**: Accepted — 2026-08-18

## Context

Phase 5's "blocco form contatti" (`piano-progetto-astro-cms.md`) started as a
single fixed-fields contact block. Mid-implementation the user asked for
something closer to WordPress's Gravity Forms instead — a real form
builder: forms are created and edited in the admin panel, and a Puck block
lets a content editor pick _which_ form to embed on a page, rather than
every page getting the same hardcoded name/email/message fields. This is a
materially bigger feature than the original single-block plan, comparable
in scope to Phase 4 (media pipeline) — worth its own ADR rather than folding
the decisions into ADR-0014.

`form_submissions` (table, domain entity) already existed from Phase 1,
unused — its `payload: Record<string, unknown>` JSONB shape happened to
already be generic enough for arbitrary form fields, not just a fixed
contact-form shape.

## Decision

### Forms are a first-class entity, not a fixed block

A new `forms` table (`id, tenant_id, site_id, name, fields, notification_email`)
holds each form's field definitions as a JSONB array. The Puck block
(`Form`) doesn't carry field definitions itself — it carries a `formId`
(plus a denormalized `formName` for the editor canvas label only, purely
cosmetic) and a custom field with a form picker, mirroring the
`MediaPickerContext` pattern already used for Image/Gallery: a
`FormListContext` port in `@kometio/puck-config`, implemented by
`apps/editor-app`, keeps the block config itself free of any HTTP concern
(see ADR-0007).

### Field definitions are fetched live at render time, not snapshotted

Considered: (A) apps/public-site fetches a form's current field
definitions from a new public endpoint every time the block renders; (B)
the field definitions get embedded into the page's block props when the
form is picked in the editor, same denormalization Image/Gallery use for
`{mediaId, url}`.

Chose A, confirmed with the user. Unlike a picked image (a fixed asset — an
already-decided answer to "which specific photo"), a form's field
structure is closer to a shared, centrally-managed piece of content: the
entire value of building a form once and reusing it across pages is
undermined if editing it later doesn't propagate to pages already using
it. The cost is a second API round-trip per page render when that page
has a Form block — accepted at brochure/showcase-site scale, same
reasoning applied throughout this product's other scope calls.

### Field type set: text, email, textarea, tel, checkbox, select

Confirmed with the user over a minimal text/email/textarea-only set.
Covers the large majority of real contact/request forms without
approaching Gravity Forms' full breadth — explicitly no file upload,
conditional field logic, multi-page forms, or payment fields in v1.

### Notification recipient lives on the form, not the site

Each form has its own `notificationEmail` (single address, not a list —
matches the "simpler than Gravity Forms" framing) rather than a
site-level default. A form's value is being reusable and independently
configurable; tying notification routing to the site would mean every
form on a site notifies the same address even when an agency wants, say,
a "richiedi preventivo" form and a "candidature lavoro" form on the same
site routed to different people.

### Submission delivery: same-origin proxy through apps/public-site, not a direct cross-origin POST

The browser posts to an Astro-hosted endpoint on apps/public-site's own
origin (same pattern already used for reads — apps/public-site is the only
thing that ever talks to the real API from a browser's perspective), which
then calls the real API server-side. Avoids touching the API's CORS config
(ADR-0010's session-cookie-driven single-origin policy) for an
unauthenticated, uncredentialed write path that has nothing to do with
editor-app's origin.

### Honeypot: silent accept, never a visible rejection

A CSS-hidden text field real users never see or fill. If it arrives
non-empty, the submission is discarded server-side but the response still
looks like success (redirect to the same "grazie" state) — never tips off
the bot with a distinguishing failure signal it could probe for.

## Consequences

- `forms` needs the same `tenant_id` + RLS treatment as every other table.
- `form_submissions` gains `form_id` (nullable, `onDelete: 'set null'` —
  same reasoning as its existing `page_id` column: deleting a form must
  never destroy the historical record that someone submitted it).
- No submissions-inbox UI in the admin panel for v1 — email notification
  is the only delivery mechanism right now. Explicitly deferred, not
  forgotten: revisit if email-only turns out to be insufficient once
  people are actually using this.
- **Explicitly not locked in**, same framing as ADR-0014: if the product
  outgrows brochure/showcase-site scale, the live-fetch choice or the single
  notification address are the first things to revisit, not a sign this
  was the wrong call for today's shape.
