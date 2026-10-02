import { type Site } from '@kometio/domain-core';
import type { BusinessAddress, OpeningHoursDay } from '@kometio/shared-types';
import type { SiteRepositoryPort } from '@kometio/ports';
import { requireSite } from './require-site';

export interface UpdateSiteBusinessInfoDeps {
  siteRepository: SiteRepositoryPort;
}

export interface UpdateSiteBusinessInfoInput {
  tenantId: string;
  siteId: string;
  businessAddress: BusinessAddress | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessType: string | null;
  openingHours: OpeningHoursDay[] | null;
}

export async function updateSiteBusinessInfo(
  deps: UpdateSiteBusinessInfoDeps,
  input: UpdateSiteBusinessInfoInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  site.updateBusinessInfo({
    businessAddress: input.businessAddress,
    businessPhone: input.businessPhone,
    businessEmail: input.businessEmail,
    businessType: input.businessType,
    openingHours: input.openingHours,
  });
  await deps.siteRepository.save(site);

  return site;
}
