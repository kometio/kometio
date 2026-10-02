# 0073 — One place for what the specs share

**Status**: Accepted — 2026-09-16

## Context

Fixtures were being rebuilt in file after file. Seventeen application specs
called `Site.fromProps` with all of its properties spelled out; twelve API
integration suites opened with the same compile-app / create-site /
create-user / log-in sequence, each with its own copy; nineteen adapter
integration specs inserted the same tenant, site and user by hand; and in
`apps/editor-app`, fourteen record and DTO shapes were written out to mock an
API answer — a `SiteRecord` is twenty-eight fields, and eleven specs listed
all of them.

Two costs, one small and one not. The small one: adding a field to an entity
meant editing dozens of specs. The large one: every copy was free to drift.
A spec that builds its own idea of what `GET /sites/:id` returns keeps
passing long after the endpoint has changed, and a spec that mocks a
repository with `jest.fn()` asserts against an agreed answer rather than
against the query logic.

Three ways out were weighed:

- **Helper files per project.** No new library, but `apps/api` and
  `apps/editor-app` cannot reach `libs/application`'s fixtures, so the
  builders would be duplicated once per project — the same problem, fewer
  copies.
- **Fixtures on each entity**, as static test factories next to the
  production class. Cheap to find, but the fakes and the in-memory
  repositories have no entity to hang from, and production code would carry
  test constructors.
- **One library of helpers** (chosen).

The tests themselves were never a candidate for centralizing: Nx caches,
computes `affected` and enforces coverage per project, and a spec that has
moved away from the code it tests stops being run when that code changes.

## Decision

### The helpers are shared; the tests stay where they are

`libs/testing` (`@kometio/testing`) holds what a spec needs and does not care
about in full: entity builders, the in-memory repositories, the fake ports.
Every spec stays next to the code it exercises.

### The defaults are one world, and the builders agree about it

A builder returns a complete, valid object from fixed, readable values —
`site-1` in `tenant-1`, an Italian page `group-1` whose translation is
`home` — and a spec passes as overrides only the fields its test is about,
which is also how a reader sees what the test is about. The record builders
describe that same site as the API would serialize it, so a spec that mixes
the two layers finds them agreeing, and their own spec parses each default
with the zod schema the editor parses responses with: a default the real
client would reject cannot sit here unnoticed.

### A tag decides who may depend on it; a lint rule decides who may import it

The library carries the `testing` tag. Application, adapters and apps may
depend on it, and it may lean only on domain and application, since the
fakes implement ports. Module boundaries work per project, so they cannot
tell a spec from the code it tests: a `no-restricted-imports` rule refuses
`@kometio/testing` anywhere but `*.spec.*`, `*.test-fixture.*`, `src/test/`
and test setup files. Without it, a fake that reached production code would
ship.

`domain-core` and `shared-types` do not use the library — it depends on
them, so their specs importing it would close a cycle. A test of an entity
builds that entity itself.

### A helper lives where its dependencies are, not where it would be tidiest

Two of them cannot live in `libs/testing`:

- **The Postgres fixtures** (`createIntegrationTenant`, `createIntegrationSite`,
  `createIntegrationUser`) need a database client, and this library has no
  infrastructure dependency. They live in `@kometio/postgres-db`, next to the
  `deleteIntegration*` cleanup they pair with.
- **The API's integration app** (`IntegrationApp`) needs the API's Nest
  modules, and a library cannot depend on an app. It lives in
  `apps/api/src/test`.

The same rule puts the response shapes that only `apps/editor-app` declares
(media, forms, users, layout sections, taxonomies, terms) in
`apps/editor-app/src/test`.

### Test helpers a production build could reach get their own entry point

`apps/api` builds with webpack's `optimization: false`, so every export of
every module it reaches is bundled. The cleanup helpers, exported from
`@kometio/postgres-db`'s index, were already shipping inside the production
`main.js`. Both they and the new fixtures moved to a
`@kometio/postgres-db/testing` entry point: nothing in production imports it,
so the bundle no longer carries them.

`@kometio/testing/records` is a separate entry point for a different reason —
the records need `@kometio/shared-types` alone, so an editor spec that wants a
`SiteRecord` is not made to load the domain entities and the ports the
package root brings with it.

## Consequences

- An entity or a wire record changes in one place, and every spec that does
  not care about the changed field keeps passing unread.
- A spec says less, and what remains is what the test is about. Two casts
  that existed only to hand a partial record to a typed mock are gone.
- Reading a spec now takes one hop: what `buildSite()` actually contains is
  in the library, not on screen. Fixed, readable defaults are what makes
  that hop affordable.
- Many projects depend on `@kometio/testing`, so a change to it marks them all
  as affected. That is correct — it is their test support — but it makes the
  library a place to change carefully.
- `apps/api`'s prune step copies workspace dependencies including dev ones,
  so the API image carries `libs/testing` under `workspace_modules`. It is
  not resolvable at runtime and nothing imports it; the alternative would be
  not declaring the dependency where the specs need it.
