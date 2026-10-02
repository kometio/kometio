import type { Site } from '@kometio/domain-core';
import type {
  SiteRepositoryPort,
  SiteThemeBlockStylesPort,
} from '@kometio/ports';
import type { ResponsiveBlockStyle } from '@kometio/shared-types';
import { requireSite } from './require-site';

export interface UpdateSiteThemeTokensDeps {
  siteRepository: SiteRepositoryPort;
  siteThemeBlockStylesRepository: SiteThemeBlockStylesPort;
}

export interface UpdateSiteThemeTokensInput {
  tenantId: string;
  siteId: string;
  blockType: string;
  /** Which of that type's looks is being painted — `DEFAULT_VARIANT` for the type's own (ADR-0047). */
  variant: string;
  style: ResponsiveBlockStyle;
}

/**
 * Replaces the given (block type, variant)'s override wholesale (leaving
 * every other type and variant untouched) through an atomic upsert on `site_theme_block_styles`
 * (docs/adr/0022's schema follow-up — no longer `sites.theme_tokens`). The
 * site's existence has to be checked separately: the child table has only
 * an FK on `site_id`, not a constraint yielding a readable domain error —
 * an explicit `findById` beats a generic FK-violation error propagated to
 * the caller. Answers with the site it found, which the caller shows.
 */
export async function updateSiteThemeTokens(
  deps: UpdateSiteThemeTokensDeps,
  input: UpdateSiteThemeTokensInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  await deps.siteThemeBlockStylesRepository.upsert(
    input.tenantId,
    input.siteId,
    input.blockType,
    input.variant,
    input.style,
  );
  return site;
}
