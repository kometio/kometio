import type { Site } from '@kometio/domain-core';
import type {
  AvailableTheme,
  SiteRepositoryPort,
  SiteThemeBlockStylesPort,
  ThemeCatalogPort,
} from '@kometio/ports';
import { requireSite } from './require-site';

export interface SiteRef {
  tenantId: string;
  siteId: string;
}

/** A site of this tenant, or SiteNotFoundError — the same answer for another tenant's site as for none. */
export function getSite(
  deps: { siteRepository: SiteRepositoryPort },
  input: SiteRef,
): Promise<Site> {
  return requireSite(deps.siteRepository, input.tenantId, input.siteId);
}

/**
 * The block styles a site overrides, by block type and then variant. They
 * are not part of `Site` (docs/adr/0022), so anything that answers with a
 * whole site reads them beside it.
 */
export function listSiteThemeBlockStyles(
  deps: { siteThemeBlockStylesRepository: SiteThemeBlockStylesPort },
  input: SiteRef,
) {
  return deps.siteThemeBlockStylesRepository.listBySite(
    input.tenantId,
    input.siteId,
  );
}

/** The themes this deployment can put a site on. */
export function listAvailableThemes(deps: {
  themeCatalog: ThemeCatalogPort;
}): Promise<AvailableTheme[]> {
  return deps.themeCatalog.listAvailableThemes();
}
