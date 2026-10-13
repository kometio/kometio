// Applies the pending database migrations, as the database's administrator.
//
// What `drizzle-kit migrate` does (the compose stack's `migrate` service),
// without drizzle-kit: it is a development tool and is not in the runtime
// images, but the migrator it calls is drizzle-orm's own, which the API
// already carries. The SQL travels inside the API artefact, so the
// migrations that run are the ones of the version of the code that starts.
//
// Reads the connection from POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER,
// POSTGRES_PASSWORD (optional: the embedded database trusts its own socket)
// and POSTGRES_DB, as the compose stack's `migrate` service does.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Refusal, assertDatabaseIsNotNewer } from './archive.mjs';

const API = '/opt/api';
const store = join(API, 'node_modules/.pnpm');

// drizzle-orm and postgres are dependencies of @kometio/postgres-db, so pnpm
// keeps them beside that package in its store rather than at the top of the
// API's node_modules. The folder's name carries pnpm's own suffix, hence the
// lookup by prefix.
const dbPackage = readdirSync(store).find((name) =>
  name.startsWith('@kometio+postgres-db@'),
);
if (!dbPackage) {
  throw new Error('@kometio/postgres-db is not in the API artefact');
}
const requireFromDb = createRequire(
  join(store, dbPackage, 'node_modules/@kometio/postgres-db/package.json'),
);
const postgres = requireFromDb('postgres');
const { drizzle } = requireFromDb('drizzle-orm/postgres-js');
const { migrate } = requireFromDb('drizzle-orm/postgres-js/migrator');

const env = process.env;
const sql = postgres({
  host: env.POSTGRES_HOST,
  port: Number(env.POSTGRES_PORT ?? 5432),
  username: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD || undefined,
  database: env.POSTGRES_DB,
  max: 1,
  // The migrations are chatty about objects that already exist.
  onnotice: () => undefined,
});

try {
  // Before anything is changed: a volume that a newer version has migrated is
  // not started by an older image (docs/adr/0119's README, "Update").
  const journal = JSON.parse(
    readFileSync(
      join(
        API,
        'workspace_modules/@kometio/postgres-db/drizzle/meta/_journal.json',
      ),
      'utf8',
    ),
  );
  const applied = await sql`select created_at from drizzle.__drizzle_migrations`
    // A database that is new has no such table yet: nothing is newer.
    .catch((error) => (error.code === '42P01' ? [] : Promise.reject(error)));
  assertDatabaseIsNotNewer(
    journal,
    applied.map((row) => row.created_at),
  );
  await migrate(drizzle(sql), {
    migrationsFolder: join(
      API,
      'workspace_modules/@kometio/postgres-db/drizzle',
    ),
  });
  console.log('migrations are up to date');
} catch (error) {
  if (!(error instanceof Refusal)) throw error;
  console.error(`[kometio] ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
