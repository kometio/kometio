# 0009 — Enforced test coverage thresholds, computed over the whole `src/` tree

**Status**: Accepted — 2026-08-17

## Context

No project in the workspace enforced a coverage floor. Every `vitest.config.mts`
enabled coverage collection (`provider: 'v8'`) purely for local visibility, and
`apps/api`'s `jest.config.cts` didn't collect coverage at all — nothing failed
CI regardless of how little a project was tested.

Worse: with no explicit `coverage.include` (Vitest) or `collectCoverageFrom`
(Jest), both tools only compute coverage over files touched by at least one
`import` from a running spec — a source file with zero specs is silently
absent from the denominator, not counted as 0%. Every project's number looked
artificially healthy purely because untested files didn't exist as far as the
coverage calculation was concerned. This is the same problem a sibling
project (`cloudrift`) hit and fixed in its own ADR-0090, which this decision
deliberately mirrors.

## Decision

Add an explicit `coverage.include`/`coverage.exclude` + `coverage.thresholds`
block to every project's `vitest.config.mts` (Vitest projects), and the
equivalent `collectCoverageFrom` + `coverageThreshold` to `apps/api`'s
`jest.config.cts`:

- **80%** (statements/branches/functions/lines) for domain/application
  projects: `domain-core`, `application`, `shared-types`, `puck-config`.
- **60%** for infrastructure/app projects: `postgres-db`,
  `postgres-page-repository`, `editor-app`, `api` (I/O-heavy adapter and
  wiring code, harder to exhaustively branch-cover than pure domain logic).

`index.ts` barrel files are excluded everywhere: pure `export … from './x'`
re-exports with zero executable logic — a passing import proves nothing about
behavior. `*.spec.ts`/`*.test-fixture.ts` files are excluded from the
denominator itself (they're the tests, not the thing under test).

**The thresholds were met by writing real tests, not by calibrating the
number to current coverage.** Turning on explicit `include` first exposed
real, previously invisible gaps:

- `libs/application`'s three `PageNotFoundError`/`PageVersionNotFoundError`
  throw branches (in `saveDraft`, `publishPage`, `rollbackToVersion`) had
  never been exercised.
- `apps/editor-app`'s `app.tsx` had its data-loading, autosave-debounce, and
  publish logic entirely untested — inline in the component, only reachable
  through Puck's own UI. Extracted into `usePageEditor` (same pattern already
  used for `puck-data-mapper.ts` in the same directory) so the logic is
  testable without rendering Puck's drag-and-drop canvas; `pages-api-client.ts`
  had never been tested against its own behavior at all (existing specs only
  ever exercised it through an automock).
- `apps/api`'s `PagesController.findBySlug` not-found path, its
  `handleNotFound` passthrough of non-domain errors, `StaticTenantContextAdapter`'s
  missing-env-var throw, and `AppModule`'s DI wiring itself had no direct
  test.
- `libs/adapters/postgres-db`'s `client.ts` (`adminConnectionString`,
  `createAppDb`, `withTenant`) had zero tests; `withTenant` in particular
  needed a real-Postgres integration spec (`client.integration.spec.ts`,
  same pattern as `postgres-page-repository`'s) since it drives an actual
  RLS-scoped transaction.

Two exclusions beyond barrels, both narrow and documented at the point of
exclusion rather than swept in via a broad glob:

- `postgres-db/src/lib/schema.ts` — declarative Drizzle table/column
  metadata. Its `unique()`/`check()`/`index()` extraConfig callbacks are only
  ever invoked by `drizzle-kit` during migration generation, never at
  runtime, so no test could call them. Correctness is verified by the
  generated migration SQL (committed, reviewed) and by the integration specs
  hitting the real, migrated schema.
- `apps/api` switched Jest's `coverageProvider` from the default
  (babel/istanbul) to `v8`. With SWC's `legacyDecorator` transform (required
  — NestJS's DI depends on it), istanbul was attributing a phantom branch to
  every decorated class: SWC inlines a `__decorate` polyfill per file whose
  own internal ternary (`arguments.length < 3 ? … : …`) got source-mapped
  back onto the decorated file, past its real end-of-file, as an
  uncoverable branch (`typeof Reflect.decorate === 'function'` is always
  `false` in Node — that half of the ternary is genuinely dead code, not
  untested application logic). This capped every controller/module's branch
  coverage regardless of how thoroughly it was tested. `v8` reads real V8
  bytecode coverage instead of istanbul's synthesized branch map, so it
  isn't fooled by injected helper code — the same provider every Vitest
  project in this workspace already uses.

Left out of scope, both documented as pending rather than silently skipped:

- `libs/ports` — pure TypeScript interfaces, zero runtime code to cover.
- `libs/adapters/{local-disk-media-storage,s3-media-storage,lucia-auth-adapter}` —
  still Phase 3/4 stubs (`export {}`), nothing to test yet. Each already
  carries a comment saying so; thresholds apply once real implementation
  code lands, at which point it joins the 60% tier.
- `apps/public-site` — no test infrastructure at all yet (no Vitest config,
  no test script). Out of scope for a coverage-threshold PR; add it and this
  file together when the app gets its first test.

## Alternatives Considered

- **Calibrate each threshold to that project's current (pre-`include`)
  coverage.** Rejected for the same reason `cloudrift` rejected it: a
  threshold that formalizes the status quo, blind spots included, doesn't
  guarantee anything — it just documents whatever gaps already existed.
- **One global threshold for the whole workspace.** Rejected: a single
  number can't distinguish domain logic (cheap to fully branch-cover, no
  I/O) from infrastructure/UI wiring (I/O-heavy, framework glue, defensive
  branches with a different test-value ratio). Two tiers match how the
  codebase is already organized (hexagonal layers) rather than inventing a
  new axis.
- **A live-percentage coverage badge (Codecov/Coveralls).** Rejected for
  now: no such service is wired into this repo, and adding one is a separate
  decision with its own account/secrets setup. The README badge below states
  the enforced policy, not a live number, so nothing needs to be pushed to
  `main` by a bot — compatible with the repository's branch-protection rules
  with no exceptions carved out.

## Consequences

All 12 projects with a test target genuinely clear their threshold today —
several at 100%, verified via a full sequential `nx run-many -t test
--coverage --parallel=1` run (sequential for the same reason `cloudrift`
runs sequentially: avoids spurious CPU-contention timeouts under coverage
instrumentation, though this workspace's suite is currently small enough
that it isn't yet a practical concern). `editor-app`'s branch coverage
(91.66%) and `postgres-page-repository`'s (66.66%) are the tightest margins;
a future PR that adds a new branch there without a matching test could trip
the gate — that is the intended behavior of a real floor, not a bug to work
around by loosening the number preemptively.

CI's `nx run-many -t lint test build typecheck` step was split in two:
`lint build typecheck` stay bundled, `test --coverage` runs as its own
sequential step, since `--coverage` is a flag only the test executors
understand.

A coverage-policy badge was added to the README linking to the CI workflow —
see "Alternatives Considered" above for why it's static, not live.
