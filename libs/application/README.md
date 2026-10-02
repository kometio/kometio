# application

Use-case layer: one function per user-facing action (`createPage`,
`publishPage`, `inviteUser`, `submitForm`, ...), each orchestrating one or
more Port calls (`libs/ports`) against `libs/domain-core` entities. See
`docs/architecture.md` for where this sits in the overall dependency graph.

## Contract

Every use case is a plain async function `(deps, input) => result` — deps
are the Port interfaces it needs (e.g. `UserRepositoryPort`, `EmailPort`),
never a concrete adapter, framework decorator, or `apps/api`-specific type.
`apps/api`'s controllers are the only place a concrete adapter (Postgres,
SMTP, ...) gets wired in via DI; a use case itself has zero infrastructure
dependencies and zero knowledge that NestJS exists. This is what makes them
testable with plain in-memory fakes (`*.test-fixture.ts`,
`in-memory-repositories.test-fixture.ts`) instead of a real database or SMTP
server — see `docs/adr/0003-separate-application-layer-for-use-cases.md`.

Failure is always a typed `Error` subclass from `libs/domain-core`
(`UserNotFoundError`, `PageSlugAlreadyExistsError`, ...), never a raw
string or an HTTP status — `apps/api/src/app/domain-error-http-mapping.ts`
is the single place that turns a domain error into an HTTP response.

## What's here

- **Pages**: `createPage`, `saveDraft`, `publishPage`, `duplicatePage`,
  `setPageParent`, `rollbackToVersion`, `listPageVersions`,
  page-translation use cases (ADR-0017), `updateSeoMeta` (ADR-0014).
- **Public rendering**: `getPublishedPageBySlug`,
  `listPublishedPagesForSitemap`, `listPublishedPageTree`,
  `getPublishedSiteChrome` — read-only, published-content-only, consumed by
  `apps/api`'s unauthenticated `public-pages`/`public-site-layout-sections`
  controllers (ADR-0012).
- **Auth & users**: `loginUser`/`logoutUser`
  ([ADR-0010](../../docs/adr/0010-session-based-auth-foundations.md)),
  `verifyEmail`/`requestPasswordReset`/`resetPassword`
  ([ADR-0011](../../docs/adr/0011-email-verification-password-reset.md)),
  and the invite lifecycle: `inviteUser` creates an inactive `User` row and
  emails a 7-day invite token; `acceptInvite` consumes it and activates the
  account; `resendInvite` mints a fresh token and re-sends the same email
  for a still-pending invite (the original token, if unconsumed, keeps
  working too — two valid links for the same pending user is harmless) and
  rejects with `UserAlreadyActiveError` if the invite was already accepted.
  `listUsers`/`updateUserRole`/`setUserActive` round out user management,
  all admin-only at the `apps/api` controller level.
- **Forms**: `createForm`/`updateForm`/`deleteForm`/`listForms`,
  `submitForm` (public, anti-spam + attachments, ADR-0015/0020).
- **Media**: `uploadMedia`, `listMedia`, `deleteMedia` (ADR-0013).
- **Site settings**: business info, general/SEO/locale/theme settings, site
  layout sections (header/footer, ADR-0018) with their own draft/publish
  version history mirroring pages.
- `src/lib/emails/` — Kometio's own HTML email templates (invite, password
  reset, email verification), shared by every use case that sends mail.

## Running unit tests

Run `nx test application` to execute the unit tests via [Vitest](https://vitest.dev/).
