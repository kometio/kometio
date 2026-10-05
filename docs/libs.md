# Libraries index

Every `libs/*` package with a one-line summary of what it does and which
app(s) actually import it, linking to that lib's own README for the full
what/how/why. See [docs/architecture.md](architecture.md) for the dependency
graph and layering rules (`domain-core` → `ports` → `application` →
`adapters` → `apps/api`) — this file is a flat reference, not a repeat of
that layering.

"Used by" is verified, not guessed from folder names: grepped as real
`from '@kometio/<lib-name>'` import statements (subpaths included) across
`apps/*/src` and `themes/*`, ignoring the many mentions that are only
comments — an earlier version of this file counted those and got three
rows wrong.

## Shared across all three apps

| Lib                                                | What it does                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [shared-types](../libs/shared-types/README.md)     | The Zod-schema wire-contract layer: block/page content model, per-block-type props, API DTOs, the editor↔preview-iframe postMessage protocol, and the domain-level lists about block types no React package may own. Validated at every network boundary so server and client shapes can't silently drift.              |
| [block-registry](../libs/block-registry/README.md) | The block catalog: one pure-data descriptor per block type (fields, defaults, container and style rules), plus React context-based "pickers" for app-specific lookups (media/form/page/icon). Not a renderer. `apps/public-site` reads it too, for the rules a renderer needs, and `apps/api` for content sanitisation. |

## Shared by `apps/api` and `apps/public-site`

| Lib                                        | What it does                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [env-config](../libs/env-config/README.md) | `requireEnv(name)` — fails loudly and immediately when a required environment variable is missing or empty. Not `apps/editor-app`, which has its own Vite equivalent reading `import.meta.env` instead of `process.env`. |
| [rich-text](../libs/rich-text/README.md)   | The rich-text document format itself, shared so the server can sanitise what the browser produced.                                                                                                                       |

## Used only by `apps/api`

Core hexagonal-architecture layers:

| Lib                                                   | What it does                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [domain-core](../libs/domain-core/README.md)          | Pure domain entities (`PageGroup` + `PageTranslation`, `Site`, `User`, `Form`, `Media`, `Taxonomy`, ...) encapsulating their own invariants, plus domain error types and an attachment-type byte-sniffer for unauthenticated form uploads. |
| [ports](../libs/ports/README.md)                      | Every Port interface (persistence, storage, auth, email, search, captcha, newsletter, tenant context, classification) that `application` depends on and every `adapters/*` lib implements.                                                 |
| [application](../libs/application/README.md)          | Use cases orchestrating Port calls to complete a user action (`createPageGroup`, `savePageGroupContent`, `publishPageTranslation`, `rollbackPageGroupToVersion`, ...) — zero infrastructure of its own.                                    |
| [postgres-db](../libs/adapters/postgres-db/README.md) | Shared Drizzle schema, client factory, and tenant-scoping helper (`withTenant`) used by every Postgres adapter below.                                                                                                                      |

Postgres repositories (each implements one or two Port interfaces from `ports`, backed by `postgres-db`):

| Lib                                                                                                           | What it does                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [postgres-page-repository](../libs/adapters/postgres-page-repository/README.md)                               | The four page ports — `PageGroupRepositoryPort`, `PageTranslationRepositoryPort` and a version repository for each: the shared block tree, one row per language, the sibling-scoped slug hierarchy, and history saved atomically with the change. |
| [postgres-site-repository](../libs/adapters/postgres-site-repository/README.md)                               | `SiteRepositoryPort` + `SiteThemeBlockStylesPort` — site settings/theme and per-block-type theme style overrides.                                                                                                                                 |
| [postgres-site-layout-section-repository](../libs/adapters/postgres-site-layout-section-repository/README.md) | `SiteLayoutSectionRepositoryPort` + version repo — per-site/locale header/footer sections and their history.                                                                                                                                      |
| [postgres-form-repository](../libs/adapters/postgres-form-repository/README.md)                               | `FormRepositoryPort` + `FormSubmissionRepositoryPort` — form definitions and their submissions.                                                                                                                                                   |
| [postgres-media-repository](../libs/adapters/postgres-media-repository/README.md)                             | `MediaRepositoryPort` — uploaded media _metadata_ only; the file bytes live in the storage adapters below.                                                                                                                                        |
| [postgres-search-repository](../libs/adapters/postgres-search-repository/README.md)                           | `SearchPort` — Postgres full-text search (`tsvector`/`ts_headline`) over published pages.                                                                                                                                                         |
| [postgres-user-repository](../libs/adapters/postgres-user-repository/README.md)                               | `UserRepositoryPort` — admin/editor accounts, with unique-email-violation mapping under concurrency.                                                                                                                                              |
| [postgres-taxonomy-repository](../libs/adapters/postgres-taxonomy-repository/README.md)                       | `TaxonomyRepositoryPort` — classification dimensions, their terms, a term's address per language, and which pages carry which terms.                                                                                                              |
| [postgres-reusable-section-repository](../libs/adapters/postgres-reusable-section-repository/README.md)       | `ReusableSectionRepositoryPort` + version repo — sections written once and placed on many pages.                                                                                                                                                  |
| [postgres-import-job-repository](../libs/adapters/postgres-import-job-repository/README.md)                   | `ImportJobRepositoryPort` — one row per attempt at bringing a site in from somewhere else, and its report.                                                                                                                                        |
| [postgres-dashboard-stats-repository](../libs/adapters/postgres-dashboard-stats-repository/README.md)         | `DashboardStatsPort` — the counts the dashboard opens with, in one round trip instead of six.                                                                                                                                                     |

Auth & tokens:

| Lib                                                                                 | What it does                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [session-auth-adapter](../libs/adapters/session-auth-adapter/README.md)             | `AuthPort` — argon2id password hashing, opaque-token DB-backed sessions with sliding renewal.                                                                                                                                     |
| [verification-token-adapter](../libs/adapters/verification-token-adapter/README.md) | `VerificationTokenPort` — single-use DB-backed tokens (atomic `DELETE ... RETURNING`) for email verification, password reset, and user invites.                                                                                   |
| [preview-token-adapter](../libs/adapters/preview-token-adapter/README.md)           | `PreviewTokenPort` — stateless HMAC-signed, non-consuming tokens for the editor's live-preview iframe. No DB table, unlike its session/verification-token cousins.                                                                |
| [opaque-token](../libs/opaque-token/README.md)                                      | `generateOpaqueToken()`/`hashOpaqueToken()` — the "random token, store only its hash" primitive shared by `session-auth-adapter` and `verification-token-adapter`. Not imported by any app directly — only by those two adapters. |

Storage (each pair implements the same Port, swappable at deploy time):

| Lib                                                                                                                                                                   | What it does                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [local-disk-media-storage](../libs/adapters/local-disk-media-storage/README.md) / [s3-media-storage](../libs/adapters/s3-media-storage/README.md)                     | `MediaStoragePort` — curated media-library storage with an EXIF-orient/resize/WebP pipeline. Local-disk vs. S3-compatible; both are given the same `ImageOptimizerPort`, so a picture becomes the same thing wherever it is kept. |
| [sharp-image-optimizer](../libs/adapters/sharp-image-optimizer/README.md)                                                                                             | `ImageOptimizerPort` — EXIF-orient, scale down to 1600 px, re-encode to WebP; refuses a file that cannot be decoded (`UnreadableImageError`). Handed to both media storage adapters.                                              |
| [local-disk-attachment-storage](../libs/adapters/local-disk-attachment-storage/README.md) / [s3-attachment-storage](../libs/adapters/s3-attachment-storage/README.md) | `AttachmentStoragePort` — raw-bytes form-attachment storage, no processing. Local-disk vs. S3-compatible, selected via `MEDIA_STORAGE_PROVIDER`.                                                                                  |

Outbound communication:

| Lib                                                                                                                                       | What it does                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [log-email-adapter](../libs/adapters/log-email-adapter/README.md)                                                                         | `EmailPort` with no mail server — writes each email, link included, to a log.                                      |
| [smtp-email-adapter](../libs/adapters/smtp-email-adapter/README.md)                                                                       | `EmailPort` via Nodemailer — generic SMTP, no vendor lock-in.                                                      |
| [brevo-newsletter](../libs/adapters/brevo-newsletter/README.md) / [mailchimp-newsletter](../libs/adapters/mailchimp-newsletter/README.md) | `NewsletterPort` implementations — Brevo's contacts API (upsert) vs. Mailchimp's Marketing API (MD5-keyed upsert). |
| [turnstile-captcha](../libs/adapters/turnstile-captcha/README.md)                                                                         | `CaptchaPort` — Cloudflare Turnstile verification, fail-closed.                                                    |

Themes and foreign content:

| Lib                                                                             | What it does                                                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [filesystem-theme-catalog](../libs/adapters/filesystem-theme-catalog/README.md) | `ThemeCatalogPort` — which themes this image ships, read off `themes/` on disk.                                                  |
| [wordpress-wxr](../libs/adapters/wordpress-wxr/README.md)                       | `WordPressExportReaderPort` — a streaming reader for a WordPress export, because a real one is hundreds of megabytes (ADR-0082). |

## Shared by `apps/editor-app` and `apps/public-site`

| Lib                                                    | What it does                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [rich-text-editor](../libs/rich-text-editor/README.md) | The Tiptap editor itself — used by the inspector's rich-text field and, inside the preview iframe, by in-place editing on the canvas. |

## Used only by `apps/editor-app`

None. Everything the editor imports it shares with at least one other app —
which is the layering working, not an accident.

## Used by `apps/public-site` and by themes

These two are what a theme depends on, so they are also what a theme built
**outside** this monorepo would have to install. That dependency direction
is deliberate (ADR-0037): neither may reach back into `block-registry`,
which is React and editor UI.

| Lib                                              | What it does                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [theme-runtime](../libs/theme-runtime/README.md) | The runtime half of a theme: the helpers and shared strings a theme's own components render against.                                                                |
| [block-sdk](../libs/block-sdk/README.md)         | What a theme needs to declare a block of its own: `defineBlock`, the field descriptor types, and `CORE_BLOCK_TYPES` so it can check it is not shadowing a core one. |

## Used only by the specs

| Lib                                  | What it does                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [testing](../libs/testing/README.md) | Builders, in-memory repositories and fake ports that `apps/api`'s and `apps/editor-app`'s specs share. A lint rule keeps it out of production code — see ADR-0073. |
