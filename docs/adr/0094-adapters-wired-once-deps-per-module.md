# 0094 — Adapters are wired once; a module hands its use cases one deps object

**Status**: Accepted — 2026-09-29

## Context

Every NestJS module in `apps/api` built its own adapters. `SITE_REPOSITORY`
was declared as ten different symbols and built eleven times; the Turnstile
captcha three times, the SMTP transport and the preview-token signer twice
each. Because each module had its own token, a test that swapped "the"
captcha swapped one module's.

Every controller was the composition root of its use cases. It injected
up to twelve ports and assembled a slightly different bundle of them in
each handler. The public pages controller rebuilt the same nine
dependencies in every route.

The tenant came from `TenantContextPort`, a request-scoped provider read
seventy times across fifteen controllers. Because of it, each of those
controllers was built again for every request. Only controllers and one
guard used the port; no use case did.

Configuration was read from `process.env` in twenty places, next to a
schema (`env-schema.ts`) that validated the same variables at startup and
was then ignored. Some variables were read without being in the schema at
all.

## Decision

- **One module wires every adapter to its port.** `AdaptersModule`
  (`apps/api/src/app/adapters/`) is the one place that names Postgres,
  SMTP, S3 or Turnstile. `port.tokens.ts` declares one token per port.
  Feature modules import `AdaptersModule` explicitly. It is not `@Global`,
  for the reason `DeploymentTenantModule` gives: integration specs build
  smaller graphs than the app.
- **A module hands its use cases one deps object.** `moduleDeps()`
  builds it from the shared tokens, each key naming the token its value
  comes from. A controller injects it and passes it whole:
  `publishPage(this.deps, input)`. Its keys are the names the use cases
  already use (`siteRepository`, `mediaStorage`), so one object satisfies
  every use case of the module. Only things injected by token go in it:
  ports and the deployment resolvers. Classes injected by type — a
  presenter, the setup-token registry, the session cookie — stay
  constructor parameters.
- **The tenant is a handler parameter.** `@TenantId()` and `@UserId()`
  read what `SessionAuthGuard` wrote on the request. Read on a route the
  guard does not cover, they throw, and that is a bug. `TenantContextPort`
  is removed from `@kometio/ports`. Controllers are no longer
  request-scoped.
- **The environment is read once, typed.** `validateApiEnv()` returns an
  `ApiEnv`, and `API_ENV` hands it to every factory. A variable required
  only in some configurations (S3's, once S3 is chosen) is read with
  `requiredIn(env, key)`, which narrows its type. Variables that were read
  without being declared — `S3_MEDIA_ENDPOINT`,
  `S3_MEDIA_FORCE_PATH_STYLE`, `KOMETIO_THEME`, `PORT` — are now in the
  schema.
- **A controller calls use cases, and lint says so.** Reaching into a
  port from a controller puts a rule where the use cases and their specs
  cannot see it: the forms controller was found doing it in the 2026-08
  security review, and nine more places had done the same since. They
  now go through use cases (`getSite`, `createPagePreviewToken`,
  `uploadFormAttachment`, …), and `no-restricted-syntax` refuses
  `this.deps.<port>.<method>()` in a controller. What a controller may
  still ask of a dependency is what is not a rule: the deployment's
  resolvers, the generation slots, and the address of a stored file.
  Cleaning a language's overlay before it is kept moved into the use
  case, behind a `ContentSanitizerPort`; a translation whose group is
  gone is now refused, where the value used to be kept as typed. The
  first-run wizard's session is opened by `bootstrapDeployment`.
- **Postgres is named in one place.** The health check, the scheduled
  clean-ups and the tenant lookup reached the database themselves; they
  now use `DatabaseHealthPort`, `ExpiredRecordsPort` and
  `TenantDirectoryPort`, and lint refuses `@kometio/postgres-db` in the API
  outside `adapters/` and `database.module.ts`.
- **The session cookie lasts as long as its session.** `SessionCookies`
  sets `expires` to the session's own `expiresAt`, instead of a duration
  imported from the session adapter that the two could disagree on.

## Consequences

- Adding a port means one token, one line in `AdaptersModule`, and one
  key in each deps object that uses it. Changing an adapter means one
  line.
- A controller test builds its controller from a plain object and passes
  the tenant as an argument; no fake tenant context is needed.
- An integration spec's `overrideProvider(CAPTCHA_PORT)` now reaches every
  module that uses the captcha.
- A misconfigured environment is refused by the same schema whether it
  is read by `main.ts` or by a module built in a test.
