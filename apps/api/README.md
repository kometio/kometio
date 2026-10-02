# @kometio/api

The backend: NestJS, REST under `/api`, Postgres via Drizzle. Ports & Adapters
(hexagonal architecture) — see `docs/architecture.md` for the full dependency
graph and [ADR-0003](../../docs/adr/0003-separate-application-layer-for-use-cases.md)
for why `libs/application` exists as its own layer between `domain-core` and
this app.

## Layering, as wired here

```
libs/domain-core   entities + domain errors (Page, Site, User, Media, Form, ...)
libs/ports         interfaces the adapters implement (PageRepositoryPort, ...)
libs/application   use cases (createPage, publishPage, loginUser, ...)
libs/adapters/*    concrete Port implementations (Postgres, local-disk/S3, auth, email, ...)
apps/api           DI wiring only — each *.module.ts provides the concrete
                    adapter behind its Port token and injects it into a
                    controller; see e.g. src/app/pages/pages.module.ts
```

Controllers never catch/map domain errors themselves: a use case throws a
`domain-core` error class, and the global `HttpExceptionFilter`
(`src/app/http-exception.filter.ts`) maps it to an HTTP status via the
`DOMAIN_ERROR_MAPPINGS` table in `src/app/domain-error-http-mapping.ts`. See
`docs/architecture.md`'s "Domain errors → HTTP mapping" section before adding
a controller-local try/catch for a domain error — there's almost certainly
already a table row for it, or it's missing one.

## Modules (`src/app/`)

- `auth/` — session cookie issuing/validation, `SessionAuthGuard`,
  `RolesGuard`, invite/verify/reset flows.
- `pages/`, `public-pages/` — authenticated CRUD (draft/publish/versions/
  translations) vs. the unauthenticated, published-only read path public-site
  calls.
- `sites/` — site settings (theme, SEO, locales, business info).
- `site-layout-sections/`, `public-site-layout-sections/` — header/footer
  sections, same authenticated/public split as pages.
- `media/` — upload + local-disk/S3 storage.
- `forms/`, `public-forms/` — form builder CRUD vs. public unauthenticated
  submission (anti-spam, attachments).
- `public-newsletter/` — public newsletter-signup submission.
- `users/` — user management, admin-only invites.
- `maintenance/` — `ExpiredTokensCleanupService`, a daily `@Cron` job pruning
  expired verification/reset tokens.
- `database.module.ts` — the single `@Global()` `KometioDb` pool every other
  module injects (`DATABASE` token) instead of constructing its own.

Every module that touches Postgres follows the same shape as
`pages.module.ts`: `imports: [DatabaseModule, AuthModule]`, then a
`useFactory` provider per Port token constructing the concrete adapter from
`DATABASE`.

## Running

```sh
pnpm exec nx run @kometio/api:serve   # watch mode, http://localhost:3000/api
```

Needs Postgres migrated and seeded first — see `docs/development.md` for the
full sequence (`docker compose up -d postgres`, then from
`libs/adapters/postgres-db`: `db:migrate`, `db:seed`). `db:seed` creates the
fixed dev tenant/site and the dev/test admin user (no public registration
endpoint exists, see [ADR-0010](../../docs/adr/0010-session-based-auth-foundations.md)).

Required env vars are read via `requireEnv()` (`libs/env-config`) and fail
loudly at startup if missing — see `.env.example` at the repo root for the
full annotated list (`DEFAULT_TENANT_ID`, `PREVIEW_TOKEN_SECRET`,
`EDITOR_APP_URL`, `MEDIA_UPLOAD_DIR`, SMTP/Turnstile/newsletter vars, ...).

## Nx targets

```sh
pnpm exec nx run @kometio/api:serve       # dev, watch mode
pnpm exec nx run @kometio/api:build       # webpack build (production by default)
pnpm exec nx run @kometio/api:test        # jest
pnpm exec nx run @kometio/api:lint        # eslint
pnpm exec nx run @kometio/api:typecheck   # tsc --noEmit
```

Coverage thresholds are enforced — see
[ADR-0009](../../docs/adr/0009-enforced-coverage-thresholds.md).

## Auth, RLS, tenant scoping

- **RLS**: every tenant-scoped table has `FORCE ROW LEVEL SECURITY`; the app
  connects as the non-superuser `kometio_app` role, never the migration
  superuser — superusers silently bypass RLS regardless of the policy. See
  [ADR-0002](../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).
- **Sessions**: opaque, DB-backed, cookie-based (`httpOnly`+`secure`+
  `sameSite=lax`), never a JWT — `SessionAuthGuard`/`RolesGuard`
  (`src/app/auth/`) gate every non-public route, and a handler reads the
  request's tenant and user from the validated session with `@TenantId()`
  and `@UserId()`. See
  [ADR-0010](../../docs/adr/0010-session-based-auth-foundations.md) and
  [ADR-0094](../../docs/adr/0094-adapters-wired-once-deps-per-module.md).
- **Tenant resolution before a session exists** (`POST /auth/login` itself,
  and the public unauthenticated read paths): falls back to
  `DEFAULT_TENANT_ID`, valid only because Kometio is single-tenant per
  deployment by design. See
  [ADR-0006](../../docs/adr/0006-temporary-fixed-tenant-resolution-pre-auth.md)
  for the original constraint and ADR-0010 for why `DEFAULT_TENANT_ID`
  outlived it with a narrower job.

## Database

Schema, migrations, RLS policies, and the seed scripts all live in
`libs/adapters/postgres-db` — see that library's own README for the
migration workflow (`drizzle-kit generate --name ...`, hand-written RLS
migrations, `db:migrate`/`db:seed`).
