import { SiteNotFoundError, type Site } from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';

/**
 * The site a request names, within this tenant, or SiteNotFoundError.
 *
 * A site id arrives in the request, and a foreign key accepts any site
 * that exists, whichever tenant it belongs to: row-level security filters
 * what is read, not what a new row points at. So whatever is written for
 * a site is written only once this has found it, and "not found" is the
 * answer for another tenant's site as much as for none.
 */
export async function requireSite(
  siteRepository: Pick<SiteRepositoryPort, 'findById'>,
  tenantId: string,
  siteId: string,
): Promise<Site> {
  const site = await siteRepository.findById(tenantId, siteId);
  if (!site) {
    throw new SiteNotFoundError(siteId);
  }
  return site;
}
