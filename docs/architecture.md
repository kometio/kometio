# Architecture

Kometio follows Ports & Adapters (hexagonal architecture): the domain knows nothing
about infrastructure details, infrastructure lives only in the adapters. See also
[docs/adr](adr/) for decisions with a real trade-off behind them.

## Dependency graph

```
domain-core   (pure entities, zero dependencies)
    ^
    |
  ports       (interfaces: PageGroupRepositoryPort, PageTranslationRepositoryPort,
               MediaStoragePort, AuthPort, ...)
    ^
    |
application   (use cases: createPageGroup, savePageGroupContent,
               savePageTranslationFieldValues, publishPageTranslation,
               listPageGroupVersions, rollbackPageGroupToVersion —
               depends on domain-core + ports)
    ^
    |
adapters/*    (concrete Port implementations: Postgres, local/S3 storage, auth)
    ^
    |
 apps/api     (NestJS — DI wiring: injects concrete adapters behind the Port
               interfaces, exposes REST)
```

`shared-types` is cross-cutting: it defines the content model (`Block`,
`PageContent`, `SeoMeta`) shared between `domain-core`, `apps/editor-app` and
`apps/public-site`, so the editor, API and rendering can never drift on what a
block means. The shapes the HTTP API answers with (`SiteRecord`,
`PublishedPage`, `PageGroupRecord`, ...) are a separate library,
`api-contracts` (ADR-0096): `domain-core` and the other `domain` libraries
cannot depend on it, so a domain rule never has to be written in terms of
one client's response.

Rule of thumb for where a new piece of code belongs:

- **Changes only an entity's business rules** (e.g. "a published page can't go back
  to draft without a new publish") → `domain-core`.
- **The domain needs a new way to talk to the outside world** (new kind of
  repository, new storage) → new interface in `ports`.
- **Orchestrates several Port calls to complete a user action** → new use case in
  `application`.
- **Concretely implements a Port** (SQL query, S3 call, password hashing) → new
  adapter in `libs/adapters/`.

## Multi-tenancy and Row Level Security

Every table with per-tenant data has `tenant_id` from day one (even in
single-tenant mode) and Row Level Security enabled with a
`tenant_id = current_tenant()` policy (see
`libs/adapters/postgres-db/drizzle/0000_baseline_schema.sql`).
`current_tenant()` reads the Postgres session variable `app.current_tenant_id`.
Every Postgres adapter must set it via `withTenant()` (`libs/adapters/postgres-db`)
before running a query — it sets the variable inside a transaction
(`is_local = true`), not for the whole session, because connections are pooled
and reused across requests for different tenants.

**Critical point**: RLS only protects if the application connection is NOT a
superuser — see [ADR-0002](adr/0002-non-superuser-role-for-rls-enforcement.md).
The `kometio_app` role (created in `db/init/000_roles.sh`) is what the backend must
always use at runtime. Schema and RLS policies are Drizzle-managed — see
[ADR-0004](adr/0004-drizzle-as-schema-source-of-truth.md).

## Auth

Session-based, roll-your-own (Lucia Auth was deprecated in March 2025 — see
[ADR-0010](adr/0010-session-based-auth-foundations.md) for the full
rationale, including why `DEFAULT_TENANT_ID` still exists after auth
landed). `SessionAuthGuard` (`apps/api/src/app/auth/`) validates the
`kometio_session` cookie on every `PageGroupsController` route and attaches the
resolved tenant/user to the request; a handler reads them back out as
parameters, `@TenantId()` and `@UserId()`
([ADR-0094](adr/0094-adapters-wired-once-deps-per-module.md)) — replacing
the temporary `StaticTenantContextAdapter` from
[ADR-0006](adr/0006-temporary-fixed-tenant-resolution-pre-auth.md).
`libs/adapters/session-auth-adapter` implements `AuthPort` (argon2id
hashing via `@node-rs/argon2`, opaque DB-backed sessions — never a JWT).
There is no public registration endpoint; the dev/test user comes from
`pnpm --filter @kometio/postgres-db run db:seed`.

Email verification and password reset (see
[ADR-0011](adr/0011-email-verification-password-reset.md)) use a second,
separate opaque-token mechanism (`libs/adapters/verification-token-adapter`,
single-use via an atomic `DELETE ... RETURNING`) rather than reusing
sessions — both share their random-token generation/hashing through
`libs/opaque-token`. `libs/adapters/smtp-email-adapter` implements
`EmailPort` via `nodemailer`; Kometio's own HTML email templates live in
`libs/application/src/lib/emails/`, each written in the language of the
person it is for — the one they chose, else the site's ([ADR-0100](adr/0100-emails-are-written-in-the-language-of-the-person.md)).
Login is not currently gated on email
verification — an explicitly tracked future decision, not an oversight (see
ADR-0011).

There is no public registration; new users only ever arrive via an
admin-only invite (`inviteUser`, `apps/api`'s `UsersController`). Same
`VerificationTokenPort` mechanism as above, purpose `'user-invite'`,
7-day TTL: the `User` row is created immediately with `isActive: false` and
an unguessable random password hash, so nobody can sign in until
`acceptInvite` consumes the token, sets a real password, and activates the
account. `resendInvite` mints a fresh token and re-sends the invite email
for a still-pending invite — added because the original token had no
cleanup job and no way to re-issue it, permanently blocking the invitee's
email against `UserEmailAlreadyExistsError` once it expired. A second valid
token for the same pending user is harmless (both work, whichever is used
first wins); `resendInvite` does reject with `UserAlreadyActiveError` once
the invite has already been accepted, since re-sending it at that point
would let the holder reset a real, in-use password outside the
forgot-password flow (which invalidates sessions; this doesn't).

A signed-in person changes their own password (`POST /account/password`) or
email (`POST /account/email-change`, confirmed from a link sent to the new
address at `POST /auth/confirm-email-change`) by giving the current password
again — see [ADR-0098](adr/0098-changing-how-you-sign-in.md). The email
change reuses `VerificationTokenPort` with purpose `'email-change'`, and the
new address rides in the token's `payload`.

## Domain errors → HTTP mapping

Domain errors (`libs/domain-core/src/lib/errors.ts`, one `Error` subclass
per failure a use case can throw, e.g. `PageNotFoundError`,
`UserEmailAlreadyExistsError`) are mapped to an HTTP status in exactly one
place: `apps/api/src/app/domain-error-http-mapping.ts`'s
`DOMAIN_ERROR_MAPPINGS` table, consumed by the global `HttpExceptionFilter`
(`apps/api/src/app/http-exception.filter.ts`). Controllers never
catch/map domain errors themselves — a use case throws, the filter maps it
(or, if the error isn't in the table, logs it and returns a generic 500).
This replaced seven near-identical private `handleDomainErrors`
try/catch blocks, one per controller. **To add a new domain error**: add the class to
`libs/domain-core`, add one `[ErrorClass, factory]` row to
`DOMAIN_ERROR_MAPPINGS`, done — no controller change needed.

`AuthController` deliberately doesn't go through this table: its three
errors (`InvalidCredentialsError`, `UserNotActiveError`,
`InvalidOrExpiredTokenError`) carry anti-enumeration logic (the same
generic message for "wrong password" and "account disabled" — see
`loginUser`) that a blanket per-class mapping would break, so it stays
handled locally in that controller, unchanged.

## Content model

A page's "content" is an array of blocks (`PageContent = Block[]`,
`libs/shared-types`), each optionally holding nested `children: Block[]` for
container-style blocks (e.g. columns) — Kometio's own nesting vocabulary.
`apps/editor-app`'s custom canvas editor (`apps/editor-app/src/app/canvas/`)
reads and writes `Block[]` directly; there is no third-party editor library
and no data-format mapping layer to isolate anymore. `Block[]` was
originally designed to stay independent of Puck's own data format
(`root`/`content`/`zones`) while Puck was still in use as the editor —
Puck has since been fully removed, and that independence is exactly why the
removal cost the content model, the Postgres schema, and
`apps/public-site`'s renderer nothing — see
[ADR-0007](adr/0007-nested-block-content-model-independent-of-puck.md) for
the original decision.

**A page is not one row.** What used to be a single `Page` per language is
now a pair, and knowing which half owns what is most of understanding this
codebase:

- **`PageGroup`** owns everything shared across languages: the canonical
  block tree (`content`), where the page sits in the site's hierarchy
  (`parentId`, `order`) and which collection lists it. Adding, removing or
  reordering a block here applies to every language at once.
- **`PageTranslation`** is one language of that group: its `slug`, its
  `seoMeta`, and `fieldValues` — an overlay holding **only** the fields a
  block descriptor marks `translatable`, keyed by block. Creating a
  language is cheap precisely because it copies no structure.

That split is the point: the old model duplicated the whole tree per
language, so the two could drift apart, and the best it could ever do was
report the drift after the fact. See ADR-0017's supersession and the
entities' own comments in `libs/domain-core/src/lib/entities/`.

Two consequences worth stating plainly:

- **Publishing stays per language.** One can go live today and another
  when it is ready. A `PageTranslation` carries its own `status` and its
  `publishedSnapshot`: the frozen merge of the group's structure with that
  language's `fieldValues`, as of the last `publish()`. That snapshot is
  what public rendering reads, and nothing else.
- **A language can be unlinked.** `isDiverged` marks a translation that
  has taken its structure out of the shared tree and into its own
  `divergedContent`, for the page that genuinely has to differ. Its
  `fieldValues` are then ignored.

Every save creates a version row rather than overwriting — `page_group_versions`
for the shared structure, `page_translation_versions` for a language's own — so
history and rollback are per-half too. See the use cases in
`libs/application/src/lib/use-cases/`.

## Public rendering

`apps/public-site` (Astro, `output: 'server'`, `@astrojs/node`) is a
separate, unauthenticated consumer of content — never `apps/editor-app`'s
authenticated CRUD API, and never Postgres directly. It calls a dedicated
`PublicPagesController` (`apps/api/src/app/public-pages`, no
`SessionAuthGuard`, no write routes at all) that only ever returns a
translation's `publishedSnapshot` for a `status: 'published'` page; a draft
page and a nonexistent slug 404 identically. See
[ADR-0012](adr/0012-public-site-rendering-via-dedicated-api-endpoint.md)
for the full reasoning, including why this isn't a Postgres-direct read
the way it might first seem simpler to build.

The site to render is resolved from the request's `Host` header against
`sites.domain` (`SiteRepositoryPort`/`postgres-site-repository`, new in
this decision — previously `siteId` only ever existed as a foreign key,
never a first-class read model) — never a client-supplied ID — `apps/public-site`
sends its own `Astro.url.hostname` as the `domain` parameter.

A public request has no session to derive a tenant from, so the tenant is
a property of the deployment rather than of the request:
`DeploymentTenantResolver` answers it once and caches it, from
`DEFAULT_TENANT_ID` when that is set, otherwise from the single row in
`tenants`. **Kometio is single-tenant per deployment**, and that is enforced
rather than assumed — a second row is a misconfiguration the resolver
refuses loudly, because picking one arbitrarily would mean serving one
customer's content to another's visitors. A deployment that has not run
its first-run wizard yet resolves to nothing at all, which is why
`require()` exists beside `resolve()`.

Block rendering is Astro-native (`src/components/BlockRenderer.astro`,
`src/components/blocks/`), walking `Block[]`/`children` directly — the
"Astro-native renderer" [ADR-0007](adr/0007-nested-block-content-model-independent-of-puck.md)
already anticipated. Each block's Zod prop schema (`heroPropsSchema`,
`textPropsSchema`) lives in `shared-types` specifically so
`apps/public-site` can validate against it without depending on the editor
app at all.

`apps/public-site` also serves a second, editor-only rendering mode: a
preview route (`editable=true`) that injects `data-kometio-block-id`/
`data-kometio-field` attributes and a small client script
(`src/lib/preview-bridge-client.ts`) so `apps/editor-app`'s canvas can
embed the real rendered page in an `<iframe>` and drive it via
`postMessage` (hover, click, drag-reorder, insert/remove, inline text
editing) instead of re-implementing block rendering a second time in
React — see [ADR-0028](adr/0028-canvas-inline-text-editing-via-tiptap-in-preview-iframe.md).

## Monorepo

```
apps/
  api/            NestJS — REST, DI wiring, TenantContext/auth guards
  editor-app/     React (TanStack Router) — authenticated admin SPA, the
                   custom canvas editor (src/app/canvas/), no third-party
                   page-builder library
  public-site/    Astro (SSR, @astrojs/node) — public rendering, plus an
                   editor-only preview mode embedded by editor-app's canvas
                   (see ADR-0028)

libs/            see docs/libs.md for the full index (every lib's README,
                   grouped by which app actually imports it)
  domain-core/    pure entities: PageGroup + PageTranslation (and a version
                   entity for each), Site, SiteLayoutSection, ReusableSection,
                   Collection, Taxonomy, Term, User, Media, Form,
                   FormSubmission, ImportJob
  ports/          interfaces implemented by the adapters
  application/    use cases (orchestration, zero infrastructure)
  adapters/       one lib per Port implementation — not exhaustive here, see
                   libs/adapters/ for the full current list. Notably:
    postgres-db/               Drizzle schema, client, tenant-scoping helper —
                                shared by every Postgres adapter
    postgres-page-repository/  the four page ports: PageGroup/PageTranslation
                                and their version repositories
    postgres-site-repository/  SiteRepositoryPort — domain lookup for public rendering
    postgres-form-repository/  FormRepositoryPort + form submissions
    postgres-user-repository/  UserRepositoryPort
    postgres-taxonomy-repository/, postgres-media-repository/,
    postgres-search-repository/, postgres-site-layout-section-repository/,
    postgres-reusable-section-repository/, postgres-import-job-repository/,
    postgres-dashboard-stats-repository/   one port each, same pattern
    filesystem-theme-catalog/  ThemeCatalogPort — reads themes/ off disk
    wordpress-wxr/             streaming reader for a WordPress export (ADR-0082)
    session-auth-adapter/      AuthPort — argon2id hashing, DB-backed sessions
    verification-token-adapter/ VerificationTokenPort — single-use email
                                verification/password-reset tokens
    preview-token-adapter/     stateless HMAC-signed draft-preview tokens
    log-email-adapter/         EmailPort that writes to a log (no mail server)
    smtp-email-adapter/        EmailPort via nodemailer
    local-disk-media-storage/, s3-media-storage/  MediaStoragePort implementations
    sharp-image-optimizer/                        ImageOptimizerPort, given to both of them
    local-disk-attachment-storage/, s3-attachment-storage/  form file-upload storage
    turnstile-captcha/         CaptchaPort — Cloudflare Turnstile
    mailchimp-newsletter/, brevo-newsletter/  NewsletterPort implementations
  block-registry/ the block catalog: one descriptor per type in
                   src/lib/blocks/ (fields, defaults, container and style
                   rules). Not only the editor's — `apps/public-site` reads
                   it too, for the rules a renderer needs (allowed children,
                   style vocabulary); it is not a renderer either way.
  api-contracts/  the wire shapes of the HTTP API (records, paginated lists,
                   the public site's PublishedPage/PublishedSite, the page
                   generation events); tag `contracts`, which no `domain`
                   library may depend on
  shared-types/   shared content model (Block, PageContent, SeoMeta), the
                   vocabularies the domain and the database enums read
                   (statuses, kinds, roles), the editor<->preview-iframe
                   postMessage protocol
                   (preview-bridge-protocol.ts), and the domain-level lists
                   about block types that no React package may own
                   (SEARCHABLE_BLOCK_TYPES, COMMERCE_BLOCK_TYPES)
  block-sdk/      what a theme built OUTSIDE this monorepo depends on:
                   defineBlock, the field descriptor types, CORE_BLOCK_TYPES
                   (ADR-0037 fixed this dependency direction on purpose)
  theme-runtime/  the runtime half of a theme package
  rich-text/, rich-text-editor/   the shared rich-text document format and
                   its Tiptap editor
  testing/        builders, in-memory repositories and fake ports the specs
                   share — never imported by production code (ADR-0073)
  env-config/     requireEnv() — fail loudly on a missing required env var,
                   shared by every adapter/app/script that needs one
  opaque-token/   generateOpaqueToken()/hashOpaqueToken() — shared by
                   session-auth-adapter and verification-token-adapter

themes/
  <name>/         filesystem theme packages (theme.css design tokens,
                   optional full-file component overrides). Every theme in
                   the image ships together; which one renders is the
                   site's own `Site.themeName`, resolved per request and
                   changeable from the editor without a rebuild — see
                   ADR-0042, which supersedes ADR-0032 on this point.
                   `KOMETIO_THEME` survives only as an optional allow-list
                   narrowing what a deployment offers.

db/
  init/           kometio_app role bootstrap (see docs/development.md);
                   schema/RLS/grants live in libs/adapters/postgres-db/drizzle/

docs/
  adr/            Architecture Decision Records
```
