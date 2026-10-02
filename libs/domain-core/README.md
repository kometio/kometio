# domain-core

The innermost layer of this codebase's hexagonal architecture (see
[ADR-0003](../../docs/adr/0003-separate-application-layer-for-use-cases.md)):
pure entities, domain errors, and a couple of framework-free domain
functions. No dependency on Postgres, NestJS, or any HTTP concern — only
`@kometio/shared-types` (for the Zod-validated value shapes an entity carries,
e.g. `PageContent`, `SeoMeta`) and `zod` itself.

## What's here

**Entities** (`src/lib/entities/`) — one class per aggregate root: `Page`,
`Site`, `SiteLayoutSection` (header/footer, see
[ADR-0018](../../docs/adr/0018-site-level-header-footer-layout-sections.md)),
`User`, `Media`, `Form`, `FormSubmission`, plus two plain (non-class)
snapshot interfaces, `PageVersion` and `SiteLayoutSectionVersion`. Every
entity follows the same shape:

- A private constructor plus `static create(...)` (for a brand-new
  instance, filling in defaults like `status: 'draft'`) and
  `static fromProps(...)` (for rehydrating one from a repository row).
- Getters only, no public field mutation — state changes go through named
  methods (`page.publish()`, `page.saveDraft(content)`,
  `page.restoreContent(content)`, `user.deactivate()`, ...) that also
  encapsulate the entity's own invariants, e.g. `publish()` is the only way
  `publishedContent` ever changes, and `restoreContent()` deliberately does
  _not_ auto-republish (a rollback is reviewed before going live again, the
  same "never a destructive overwrite" principle behind the separate
  `*Version` snapshot rows).
- `toProps()` to hand the plain data back to whatever adapter persists it.

Validation that needs _other_ data — e.g. "is this the same site and
locale as the proposed parent" for `Page.setParent`, or "does this slug
already exist among siblings" — is deliberately left to the
`libs/application` use-case that has repository access, not to the entity
itself; a pure entity can't look anything up.

**Domain errors** (`errors.ts`) — one exception subclass per
not-found/conflict/invalid-state case (`PageNotFoundError`,
`PageSlugAlreadyExistsError`, `InvalidCredentialsError`,
`UnsupportedAttachmentTypeError`, ...), each named for exactly the
condition it represents so a controller can map it to the right HTTP status
without string-matching a message. `InvalidCredentialsError` is
deliberately generic (never reveals whether the email exists or the
password was wrong) to avoid user enumeration on login.

**`attachment-type-sniffer.ts`** — `sniffAttachmentType(data, declaredMimeType)`
inspects the real bytes of a public form's file-upload attachment
(magic-number signatures for PDF/PNG/JPEG/GIF/WebP, ZIP/CFBF container
disambiguation for Office formats, a plain-text heuristic that rejects
anything that looks like markup) and returns a verified
`{ mimeType, extension }`, throwing `UnsupportedAttachmentTypeError`
otherwise. This exists because the public form-submission upload endpoint
is unauthenticated — a client-declared filename/MIME type can't be trusted
at all, and serving something that could render as HTML/SVG in a browser
would be a stored-XSS vector (see the 2026-08-25 security review). This is
deliberately separate from `MediaStoragePort`'s own image-only validation
in `libs/adapters` — that path is for the curated media library, this one
accepts a broad range of real-world attachment types (PDF, Office docs,
images, plain text/CSV, ZIP).

**Small value types** — `VerificationTokenPurpose`
(`'email-verification' | 'password-reset' | 'user-invite'`) and
`PreviewContentType` (`'page' | 'header' | 'footer'`), each just a union
type shared between the application layer and the Ports/adapters that key
off it.

## Used by

Depended on by `libs/ports` (entity types appear in Port method
signatures), `libs/application` (use cases operate on these entities), and
transitively by `apps/api`; not imported directly by `apps/editor-app` or
`apps/public-site`, which only ever see wire-shape DTOs from
`@kometio/shared-types`.

## Running unit tests

Run `nx test domain-core` to execute the unit tests via [Vitest](https://vitest.dev/).
