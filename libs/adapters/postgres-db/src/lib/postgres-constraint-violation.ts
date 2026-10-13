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
 * A foreign key refused the write: a row still referenced by another, under
 * ON DELETE RESTRICT, or a reference to a row that is not there.
 *
 * Two codes say it. `23503` (foreign_key_violation) is what Postgres 16 raised
 * for both, and what 18 still raises for a reference to a row that is not
 * there; for a row that is still referenced under RESTRICT, 18 raises `23001`
 * (restrict_violation) — the message is the same ("violates RESTRICT setting of
 * foreign key constraint"), the class (23, integrity constraint) is the same,
 * and `constraint_name` is the constraint's. Found by the integration suite on
 * 18 (docs/adr/0125): a page with subpages was a 500 instead of a refusal.
 */
export function isForeignKeyViolation(
  error: unknown,
  constraintNames: readonly string[],
): boolean {
  const cause = postgresErrorOf(error);
  return (
    (cause?.code === '23503' || cause?.code === '23001') &&
    constraintNames.includes(cause.constraint_name ?? '')
  );
}
