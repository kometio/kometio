import { type Site } from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';
import { requireSite } from './require-site';

export interface UpdateSiteGeneralSettingsDeps {
  siteRepository: SiteRepositoryPort;
}

export interface UpdateSiteGeneralSettingsInput {
  tenantId: string;
  siteId: string;
  name: string;
  domain: string | null;
}

export async function updateSiteGeneralSettings(
  deps: UpdateSiteGeneralSettingsDeps,
  input: UpdateSiteGeneralSettingsInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  site.updateGeneralSettings({ name: input.name, domain: input.domain });
  await deps.siteRepository.save(site);

  return site;
}
