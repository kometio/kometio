import { type Site } from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';
import { requireSite } from './require-site';

export interface UpdateSiteSeoSettingsDeps {
  siteRepository: SiteRepositoryPort;
}

export interface UpdateSiteSeoSettingsInput {
  tenantId: string;
  siteId: string;
  searchEngineIndexingEnabled: boolean;
}

export async function updateSiteSeoSettings(
  deps: UpdateSiteSeoSettingsDeps,
  input: UpdateSiteSeoSettingsInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  site.updateSeoSettings({
    searchEngineIndexingEnabled: input.searchEngineIndexingEnabled,
  });
  await deps.siteRepository.save(site);

  return site;
}
