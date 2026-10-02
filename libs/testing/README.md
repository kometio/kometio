# testing

What the specs of `application`, the adapters and the apps share, so each
one stops rebuilding the same fixtures by hand.

- **Entity builders** (`@kometio/testing`) — `buildSite`, `buildUser`,
  `buildPageGroup`, `buildPageTranslation`, `buildSiteLayoutSection`,
  `buildReusableSection`. Fixed, readable defaults (`site-1`, `tenant-1`);
  a spec passes as overrides only the fields its test is about.
- **In-memory repositories** (`@kometio/testing`) — one per repository port,
  for use cases tested without a database.
- **Fake ports** (`@kometio/testing`) — auth, captcha, email, newsletter,
  verification tokens.
- **Record builders** (`@kometio/testing/records`) — `buildSiteRecord`,
  `buildPageGroupRecord`, `buildPageTranslationRecord`,
  `buildPageGroupListItemRecord` (and its `buildPageGroupListItemTranslation`),
  `buildPageGroupVersionRecord`, `buildCollectionRecord`: the wire shapes of
  `@kometio/shared-types`, describing the same site and page as the entity
  builders. A separate entry point because they need nothing but
  `@kometio/shared-types`, so the editor's specs use them without loading the
  domain entities and ports.

```ts
import { buildSiteRecord } from '@kometio/testing/records';

vi.mocked(api.getCurrentSite).mockResolvedValue(
  buildSiteRecord({ enabledLocales: ['it', 'en'] }),
);
```

## What lives elsewhere, and why

- **Postgres fixtures** — `createIntegrationTenant`, `createIntegrationSite`,
  `createIntegrationUser` in `@kometio/postgres-db/testing`, next to the
  `deleteIntegration*` cleanup they pair with. They need a database client,
  and this library has no infrastructure dependency. A separate entry point
  rather than the package index, which the API bundles whole.
- **The API's integration app** — `IntegrationApp` in
  `apps/api/src/test/integration-app.test-fixture.ts` (`start`, `createSite`,
  `createUser`, `login`, `close`). It needs the API's Nest modules, and a
  library cannot depend on an app.
- **Editor-only response shapes** — `MediaDto`, `FormDto`, `UserDto`,
  `SiteLayoutSectionDto`, `TaxonomyDto` and the rest are declared in
  `apps/editor-app/src/lib/*-api-client.ts`, not in `@kometio/shared-types`;
  their builders are in `apps/editor-app/src/test/dtos.test-fixture.ts`.

## Rules

- **Specs only.** A lint rule (`no-restricted-imports` in the root
  `eslint.config.mjs`) refuses `@kometio/testing` anywhere but `*.spec.*`,
  `*.test-fixture.*`, `src/test/` and test setup files: a fake that reached
  production code would ship.
- **Not for `domain-core` or `shared-types`.** This library depends on them,
  so their specs importing it would be a cycle. Tests of an entity build
  that entity themselves.
- Every helper file is a `*.test-fixture.ts`, so coverage leaves it out of
  the denominator (docs/adr/0009): it is test support, not code under test.
