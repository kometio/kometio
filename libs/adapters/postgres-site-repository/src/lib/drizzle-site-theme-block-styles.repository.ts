import { and, eq } from 'drizzle-orm';
import type { SiteThemeBlockStylesPort } from '@kometio/ports';
import {
  normalizeResponsiveBlockStyle,
  type ResponsiveBlockStyle,
} from '@kometio/shared-types';
import {
  type KometioDb,
  siteThemeBlockStyles,
  withTenant,
} from '@kometio/postgres-db';

/**
 * Replaces the `UPDATE ... jsonb_set` on `sites.theme_tokens`
 * (docs/adr/0022's schema follow-up): one row per (site, block type)
 * instead of an entry nested in a single blob. The upsert stays atomic in
 * exactly the same way — simpler, in fact, a direct
 * `INSERT ... ON CONFLICT DO UPDATE` with no JSONB path to build — and it
 * only reduces how much is touched on each write (this narrow row rather
 * than the whole wide `sites` row) while enabling direct queries per block
 * type.
 */
export class DrizzleSiteThemeBlockStylesRepository implements SiteThemeBlockStylesPort {
  constructor(private readonly db: KometioDb) {}

  async listBySite(
    tenantId: string,
    siteId: string,
  ): Promise<Record<string, Record<string, ResponsiveBlockStyle>>> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(siteThemeBlockStyles)
        .where(
          and(
            eq(siteThemeBlockStyles.tenantId, tenantId),
            eq(siteThemeBlockStyles.siteId, siteId),
          ),
        ),
    );
    // Normalized on the way out, not trusted as stored (ADR-0047): a row
    // may still hold the flat pre-breakpoint shape, and one written before
    // PR #144 may hold a value today's rules refuse. Neither should be a
    // site that fails to render.
    //
    // Collected in a Map and turned into an object at the end: a block type
    // may be named `constructor`, and an object keyed by it hands back the
    // built-in of that name instead of a place to put the variants.
    const byType = new Map<string, Map<string, ResponsiveBlockStyle>>();
    for (const row of rows) {
      const variants = byType.get(row.blockType) ?? new Map();
      variants.set(row.variant, normalizeResponsiveBlockStyle(row.style));
      byType.set(row.blockType, variants);
    }
    return Object.fromEntries(
      [...byType].map(([type, variants]) => [
        type,
        Object.fromEntries(variants),
      ]),
    );
  }

  async upsert(
    tenantId: string,
    siteId: string,
    blockType: string,
    variant: string,
    style: ResponsiveBlockStyle,
  ): Promise<void> {
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .insert(siteThemeBlockStyles)
        .values({ tenantId, siteId, blockType, variant, style })
        .onConflictDoUpdate({
          target: [
            siteThemeBlockStyles.siteId,
            siteThemeBlockStyles.blockType,
            siteThemeBlockStyles.variant,
          ],
          set: { style },
        }),
    );
  }
}
