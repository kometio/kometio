# 0036 — Migration history squashed to one baseline; native `pgEnum` for 7 columns

**Status**: Accepted — 2026-08-29

## Context

By PR #97 (2026-08-29), the Drizzle migration history had grown to 31
incremental files, accumulated since Phase 1. Two independent, pre-
existing cleanup items were deferred together in an earlier pass (see
the security/architecture review's residual notes) and picked back up
by explicit user request once the rest of that review's items were
closed:

1. **31 migration files** — normal for a project with a real production
   database (each migration documents an actual schema transition a
   live database went through and must be replayable in order), but
   pure historical noise for a project that had never had one: every
   environment in existence at the time was either a fresh CI database
   or the single local dev database, both disposable.
2. **7 `text` columns with a `CHECK` constraint** standing in for what
   should be native Postgres enums (`users.role`,
   `sites.untranslated_page_fallback`, `pages.status`,
   `site_layout_sections.kind`/`.status`, `media.storage_provider`,
   `verification_tokens.purpose`) — a `CHECK (col IN (...))` constraint
   enforces the same set of allowed values as a `pgEnum` but without a
   named type Postgres itself understands, and without the `\dT`-visible
   documentation a real enum type gives a database inspector.

## Decision

### Squash 31 migrations to one `0000_baseline_schema.sql`

Three approaches were presented to the user; they picked: generate a
fresh `drizzle-kit generate` from the current `schema.ts`, then hand-
extend that generated file with the RLS policies/grants/generated-column
SQL that no migration file lets `drizzle-kit` regenerate on its own
(these were originally hand-added on top of Drizzle's own output across
several of the 31 files, and had to be re-added once to the new single
baseline). The local dev database was then dropped and recreated
against this new baseline, rather than writing a
`__drizzle_migrations`-table repair script to reconcile Drizzle's
migration ledger with the collapsed history.

**This is explicitly justified only because no production database
existed at the time** — drop-and-recreate destroys any data in the
target database, which is only acceptable when that database holds
nothing that matters. The alternative (repairing the migration-tracking
table so a database that already ran some of the 31 old migrations
believes it's equivalently caught up on the new baseline, without
touching its data) was named as the correct approach **the moment a
real production database exists** — this ADR does not claim
drop-and-recreate is the right squash strategy in general, only that it
was the right one for this specific squash, at this specific point in
the project's life.

### 7 columns move from `text` + `CHECK` to native `pgEnum`

Each becomes its own named Postgres enum type — `role`,
`untranslated_page_fallback`, `page_status`, `site_layout_section_kind`,
`site_layout_section_status`, `storage_provider`,
`verification_token_purpose`. `page_status` and
`site_layout_section_status` share the same set of allowed values
(draft/published, etc.) but are kept as **two distinct enum types, never
one shared type** — a deliberate choice from the original deferral
discussion this PR carried out, not an oversight: `Page` and
`SiteLayoutSection` are different domain concepts that happen to share a
status vocabulary today; merging their types at the database level would
couple their future evolution (e.g. one gaining a new status the other
should never have) to a shared Postgres type neither domain concept
actually owns.

## Consequences

- The local dev database was dropped and recreated as part of this
  change — any pre-existing local test/demo content was lost. Verified
  after the fact via a full drop/recreate/migrate/reseed cycle: 7 enum
  types, 12 RLS-enabled tables, 12 policies, the generated
  `search_vector` column, `kometio_app` grants, and a real RLS-scoped
  query all confirmed live against `psql`; `pg_dump`/`pg_restore`
  re-run successfully against the new baseline (the same reversibility
  smoke test introduced by `docs/adr`-adjacent work in PR #96); the
  full integration suite (11 projects) and repo-wide typecheck/lint/test
  (29 projects) all green.
- **The drop-and-recreate approach is retired the moment a real
  production database exists.** Any future migration squash, once
  production data exists, must use the migration-tracking-repair
  alternative instead — this is a one-time exception tied to this
  project's specific pre-launch timing, not an established pattern to
  repeat.
- `drizzle-kit` 0.31.10 has no down-migration support at all — this
  squash does not change that; migration reversibility for this project
  is handled entirely by the separate `pg_dump`/`pg_restore` CI smoke
  test (PR #96), not by generated down-migrations.
- Every future migration starts numbering from this new baseline
  (`0000_baseline_schema.sql`) — later work in this same window (the
  `PageGroup`/`PageTranslation` rewrite, `docs/adr/0034`) added its own
  migrations (`0004`, `0005`, ...) on top of it, confirming the baseline
  functions as a normal starting point going forward, not a one-off
  artifact.
