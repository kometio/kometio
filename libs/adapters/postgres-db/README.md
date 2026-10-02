# postgres-db

Shared Drizzle schema, client factory, and tenant-scoping helper for every
Postgres adapter (see [ADR-0004](../../../docs/adr/0004-drizzle-as-schema-source-of-truth.md)).

## Schema changes

1. Edit `src/lib/schema.ts`.
2. Generate the migration with a descriptive name — **always pass `--name`**,
   otherwise `drizzle-kit` invents a random adjective_noun filename
   (`0028_naive_cardiac.sql`) that tells a future reader nothing:

   ```
   pnpm --filter @kometio/postgres-db exec drizzle-kit generate --name <description>
   ```

3. Review the generated SQL under `drizzle/` before committing.
4. RLS policies and grants aren't expressed by Drizzle's schema builder —
   those still need a hand-written custom migration
   (`drizzle-kit generate --custom`).

Run `pnpm --filter @kometio/postgres-db run db:migrate` to apply pending
migrations locally. CI applies the full migration chain to a fresh Postgres
container on every run (`.github/workflows/ci.yml`) — that's the project's
current safety net for "does this migration apply cleanly," rather than
hand-written down-migrations (`drizzle-kit` doesn't generate those; not worth
the recurring authoring cost pre-launch with no production data to protect).

Renaming an already-applied migration's `.sql` file (and its matching `tag`
in `drizzle/meta/_journal.json`) is safe — `__drizzle_migrations` tracks
applied migrations by hash/timestamp, never by filename.

## Running unit tests

Run `nx test postgres-db` to execute the unit tests via [Vitest](https://vitest.dev/).
