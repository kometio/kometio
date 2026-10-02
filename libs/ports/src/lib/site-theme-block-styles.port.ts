import type { ResponsiveBlockStyle } from '@kometio/shared-types';

/**
 * Replaces what used to be `sites.theme_tokens.blockStyles` (a JSONB map
 * spread across the site's row) — one row per (site, block type) instead of
 * an entry nested in a blob (docs/adr/0022's follow-up). A Port of its own
 * rather than a method on SiteRepositoryPort: the same reason as SearchPort
 * — it is a distinct capability and storage, with a query shape of its own,
 * not an attribute of the site the way the Tier 1 fields (colours, font,
 * scripts) are.
 */
export interface SiteThemeBlockStylesPort {
  /** Every active override for the site, keyed by block type and then by variant (ADR-0047) — an empty map when none has ever been customized. */
  listBySite(
    tenantId: string,
    siteId: string,
  ): Promise<Record<string, Record<string, ResponsiveBlockStyle>>>;

  /** Replaces the whole override of ONE (block type, variant) — an atomic upsert on that single row. `DEFAULT_VARIANT` paints the type's own look. */
  upsert(
    tenantId: string,
    siteId: string,
    blockType: string,
    variant: string,
    style: ResponsiveBlockStyle,
  ): Promise<void>;
}
