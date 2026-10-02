import { sql } from 'drizzle-orm';
import { type KometioDb, withTenant } from './client';

export interface FormSubmissionsRetentionCleanupResult {
  deletedSubmissions: number;
}

/**
 * GDPR/privacy retention (`sites.form_submission_retention_days`, `null` by
 * default = keep forever, unchanged from before this column existed).
 * A single set-based DELETE...USING, not one query per site: the same
 * reasoning as deleteExpiredTokens (lives here, not in apps/api, so the
 * caller — a scheduled NestJS job — never needs to import drizzle-orm
 * directly). Raw SQL, not Drizzle's typed query builder: a DELETE joined
 * against another table has no clean typed representation in Drizzle's
 * builder, same precedent as DrizzleSearchRepository.search()'s raw
 * ts_headline query.
 */
export async function deleteExpiredFormSubmissions(
  db: KometioDb,
  tenantId: string,
): Promise<FormSubmissionsRetentionCleanupResult> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx.execute<{ id: string }>(sql`
      delete from form_submissions fs
      using sites s
      where fs.site_id = s.id
        and s.form_submission_retention_days is not null
        and fs.created_at < now() - (s.form_submission_retention_days || ' days')::interval
      returning fs.id
    `),
  );

  return { deletedSubmissions: Array.from(rows).length };
}
