import { type Site } from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';
import type { CookieBannerSettings } from '@kometio/shared-types';
import { requireSite } from './require-site';

export interface UpdateSiteCookieBannerSettingsDeps {
  siteRepository: SiteRepositoryPort;
}

export interface UpdateSiteCookieBannerSettingsInput extends CookieBannerSettings {
  tenantId: string;
  siteId: string;
}

export async function updateSiteCookieBannerSettings(
  deps: UpdateSiteCookieBannerSettingsDeps,
  input: UpdateSiteCookieBannerSettingsInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  site.updateCookieBannerSettings({
    enabled: input.enabled,
    position: input.position,
    acceptButtonSide: input.acceptButtonSide,
    showReopenTab: input.showReopenTab,
    reopenPosition: input.reopenPosition,
    privacyPolicyPageGroupId: input.privacyPolicyPageGroupId,
    cookiePolicyPageGroupId: input.cookiePolicyPageGroupId,
    copyOverrides: input.copyOverrides,
  });
  await deps.siteRepository.save(site);

  return site;
}
