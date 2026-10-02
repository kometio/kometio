import type { SiteLayoutSectionVersion } from '@kometio/domain-core';
import type { SiteLayoutSectionVersionRepositoryPort } from '@kometio/ports';

export interface ListSiteLayoutSectionVersionsDeps {
  siteLayoutSectionVersionRepository: SiteLayoutSectionVersionRepositoryPort;
}

export interface ListSiteLayoutSectionVersionsInput {
  tenantId: string;
  id: string;
}

export function listSiteLayoutSectionVersions(
  deps: ListSiteLayoutSectionVersionsDeps,
  input: ListSiteLayoutSectionVersionsInput,
): Promise<SiteLayoutSectionVersion[]> {
  return deps.siteLayoutSectionVersionRepository.listBySection(
    input.tenantId,
    input.id,
  );
}
