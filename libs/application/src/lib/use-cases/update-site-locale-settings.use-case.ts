import { type Site } from '@kometio/domain-core';
import type { UntranslatedPageFallback } from '@kometio/shared-types';
import type { SiteRepositoryPort } from '@kometio/ports';
import { requireSite } from './require-site';

export interface UpdateSiteLocaleSettingsDeps {
  siteRepository: SiteRepositoryPort;
}

export interface UpdateSiteLocaleSettingsInput {
  tenantId: string;
  siteId: string;
  defaultLocale: string;
  enabledLocales: string[];
  untranslatedPageFallback: UntranslatedPageFallback;
}

export async function updateSiteLocaleSettings(
  deps: UpdateSiteLocaleSettingsDeps,
  input: UpdateSiteLocaleSettingsInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  site.updateLocaleSettings({
    defaultLocale: input.defaultLocale,
    enabledLocales: input.enabledLocales,
    untranslatedPageFallback: input.untranslatedPageFallback,
  });
  await deps.siteRepository.save(site);

  return site;
}
