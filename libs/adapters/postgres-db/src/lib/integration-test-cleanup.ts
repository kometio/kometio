import { inArray } from 'drizzle-orm';
import { type KometioDb, withTenant } from './client';
import { sites, tenants, users } from './schema';

/**
 * Deletes throwaway tenants an integration spec created for itself in
 * `beforeAll` (never the app's real tenants) — every tenant-scoped table
 * cascades from `tenants.id` (see drizzle/0000_baseline_schema.sql's FK
 * definitions), so one call removes everything the spec created underneath.
 * No `withTenant` needed: unlike every table it cascades into, `tenants`
 * itself has no RLS policy, and Postgres FK cascades bypass RLS on the
 * referencing tables regardless of `app.current_tenant_id` — verified
 * empirically against a real `kometio_app` connection, not assumed from the
 * policy docs alone.
 */
export async function deleteIntegrationTenants(
  db: KometioDb,
  tenantIds: string[],
): Promise<void> {
  if (tenantIds.length === 0) return;
  await db.delete(tenants).where(inArray(tenants.id, tenantIds));
}

/**
 * Deletes throwaway sites/users an integration spec created directly under
 * a shared tenant (`DEFAULT_TENANT_ID`) instead of a tenant of its own —
 * used by the controller-level integration specs, which can't delete
 * `DEFAULT_TENANT_ID` itself the way `deleteIntegrationTenants`'s callers
 * delete their own throwaway tenant. A site's own tenant-scoped children
 * (pages, forms, media, site_layout_sections, ...) all cascade from
 * `sites.id`, so listing the site is enough; a user has no such single
 * point (nothing cascades from `users.id` except sessions/
 * verification_tokens), so every user id the spec created — including ones
 * created inside individual `it` blocks, not just `beforeAll` — must be
 * collected and passed in here.
 *
 * Unlike `deleteIntegrationTenants`, `sites`/`users` DO have their own RLS
 * policy, so the delete must run inside `withTenant` or it silently matches
 * zero rows — also verified empirically, since that failure mode is silent
 * rather than an error.
 */
export async function deleteIntegrationFixtures(
  db: KometioDb,
  tenantId: string,
  fixtures: { siteIds?: string[]; userIds?: string[] },
): Promise<void> {
  const siteIds = fixtures.siteIds ?? [];
  const userIds = fixtures.userIds ?? [];
  if (siteIds.length === 0 && userIds.length === 0) return;

  await withTenant(db, tenantId, async (tx) => {
    if (siteIds.length > 0) {
      await tx.delete(sites).where(inArray(sites.id, siteIds));
    }
    if (userIds.length > 0) {
      await tx.delete(users).where(inArray(users.id, userIds));
    }
  });
}
