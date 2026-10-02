import type { SiteRepositoryPort } from '@kometio/ports';
import {
  resolveSiteChrome,
  type PublishedSiteChrome,
  type ResolveSiteChromeDeps,
} from './resolve-site-chrome';

export interface GetPublishedSiteChromeDeps extends ResolveSiteChromeDeps {
  siteRepository: SiteRepositoryPort;
}

export interface GetPublishedSiteChromeInput {
  tenantId: string;
  domain: string;
  locale: string;
}

/**
 * Site-level chrome (header/footer/site info) without anchoring to a
 * specific page — for routes that have no backing Page row (e.g.
 * apps/public-site's search.astro) but still need the site's normal
 * header/footer for visual consistency with every real page. Same domain
 * resolution and "unmatched domain -> null" collapse as
 * getPublishedPageBySlug/searchPages — never an error.
 */
export async function getPublishedSiteChrome(
  deps: GetPublishedSiteChromeDeps,
  input: GetPublishedSiteChromeInput,
): Promise<PublishedSiteChrome | null> {
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site) {
    return null;
  }

  return resolveSiteChrome(deps, input.tenantId, site, input.locale);
}
