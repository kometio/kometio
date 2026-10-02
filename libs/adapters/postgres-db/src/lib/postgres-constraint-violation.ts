import postgres from 'postgres';

/**
 * `postgres` (porsager/postgres, the driver behind drizzle-orm/postgres-js
 * — see client.ts) rejects a write that breaks a constraint with a real
 * `PostgresError`, never a domain error: under genuine concurrency (two
 * near-simultaneous requests both passing the application's check-then-act)
 * the database, not the use case, is the first place that sees the
 * conflict. `constraint_name` matches exactly the one Drizzle generates in
 * schema.ts (also visible in the SQL migrations, e.g.
 * `pages_tenant_id_site_id_locale_parent_id_slug_unique`).
 *
 * Drizzle does not let the raw `PostgresError` surface: it wraps it in a
 * `DrizzleQueryError` of its own, with the original in `.cause` (verified
 * live against a real Postgres — see
 * drizzle-page.repository.integration.spec.ts).
 */
function postgresErrorOf(error: unknown): postgres.PostgresError | null {
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? error.cause
      : error;
  return cause instanceof postgres.PostgresError ? cause : null;
}

/** A unique constraint refused the write (23505). */
export function isUniqueViolation(
  error: unknown,
  constraintName: string,
): boolean {
  const cause = postgresErrorOf(error);
  return cause?.code === '23505' && cause.constraint_name === constraintName;
}

/**
 * A foreign key refused the write (23503): a row still referenced by
 * another, under ON DELETE RESTRICT, or a reference to a row that is not
 * there.
 */
export function isForeignKeyViolation(
  error: unknown,
  constraintNames: readonly string[],
): boolean {
  const cause = postgresErrorOf(error);
  return (
    cause?.code === '23503' &&
    constraintNames.includes(cause.constraint_name ?? '')
  );
}
