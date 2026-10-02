# 0085 — One list per enum, and the second squash

**Status**: Accepted — 2026-09-25

## Context

**Every enum was written down up to six times.** Each of the ten
Postgres enums in `schema.ts` had its values spelled out again wherever
something needed them: the domain's union type, a wire schema in
`@kometio/shared-types`, a `z.enum` in an API request schema, a hand-written
type in an editor API client, a port's projection. The user roles were declared in
six files. Nothing tied the copies together: adding a role to the domain
type compiled, and the database, the API validation and the editor all kept the old list.

**The migration history had drifted from what drizzle-kit believes.**
Twenty-four migrations had accumulated since the first squash (PR #97,
2026-08-29). The last two, `0022` and `0023`, were written by hand and
never went through `drizzle-kit generate`, so no snapshot recorded them:
the next person to run `db:generate` would have been handed a migration
recreating `import_jobs`. They had also been applied to the one database
that matters — the development database, which holds the only copy of the
documentation site — without being recorded there, so `db:migrate` on it
would have tried to run them again and failed.

## Decision

**One tuple per enum, in `@kometio/shared-types`**, next to the concept it
belongs to (`USER_ROLES` in `author.ts`, `STORAGE_PROVIDERS` in
`media-record.ts`, the header/footer lists in `site-layout-section.ts`,
and so on). Everything else is derived from it: the type
(`(typeof X)[number]`), the wire schema (`z.enum(X)`) and the database
enum (`pgEnum('x', X)`). This follows `MEDIA_KINDS`, which already worked
this way.

`shared-types` and not the domain, because it is the lowest layer every
other one reads: `domain-core` depends on it, not the other way round, so
a list in the domain could not feed the wire schemas. Two enums that hold
the same words stay two tuples — `PAGE_TRANSLATION_STATUSES`,
`SITE_LAYOUT_SECTION_STATUSES` and `REUSABLE_SECTION_STATUSES` are all
`draft`/`published` — because publishing a header has nothing to do with
publishing a page, and one list would tie them together.

The database was not touched: `drizzle-kit generate` reports no change
after the switch, and adding a value to a tuple makes it emit the
`ALTER TYPE … ADD VALUE` it should.

**The 24 migrations are squashed again**, into one
`0000_baseline_schema.sql`: what drizzle-kit generates from `schema.ts`,
plus the part it cannot describe (the generated `search_vector` column,
`current_tenant()`, row level security on the 22 tenant-scoped tables, the
grants to `kometio_app`). It was checked, not assumed: a database built from
the 24 migrations and one built from the baseline dump to identical
schemas, apart from column order.

The first squash could drop and recreate the development database, which
was empty. This one could not, so the existing database is **told**
instead of rebuilt. drizzle-kit decides what to run by comparing each
migration's `when` with the newest `created_at` it has recorded — it never
compares hashes — so the baseline carries 0023's `when`, and a database
that already had everything up to 0023 gets one row saying so
(`docs/development.md`, "The 2026-09-25 squash"). That was rehearsed on a
restored copy first: without the row, `migrate` fails; with it, `migrate`
runs nothing, and a later migration still applies.

**CI now runs `db:generate`** on every PR and fails if it writes anything,
so a hand-written migration without its snapshot is caught at review,
not by the next person to change the schema.

## Consequences

- A new enum value is one edit, in one tuple; the type, the validation and
  the migration follow from it.
- Column order in a fresh database differs from an old one's. Nothing
  depends on it: the code names every column, and `pg_dump` writes
  `COPY … (col, …)` with the names.
- A database that was not yet at 0023 when the squash landed cannot be
  upgraded by `db:migrate` alone. None exists outside development: no
  production database had been created.
- Migrations are forward-only, now written down (`docs/development.md`,
  `docs/self-hosting.md#upgrading`): the way back is the backup taken
  before upgrading, and the upgrade instructions take one.
