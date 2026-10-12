import {
  availableThemesResponseSchema,
  formSubmissionCountSchema,
  siteRecordSchema,
  type AvailableTheme,
  type SiteRecord,
  type UpdateBusinessInfoBody,
  type UpdateCookieBannerSettingsBody,
  type UpdateFormSubmissionRetentionBody,
  type UpdateGeneralSettingsBody,
  type UpdateLocaleSettingsBody,
  type UpdateSeoSettingsBody,
  type UpdateThemePackageBody,
  type UpdateThemeSettingsBody,
  type UpdateThemeTokensBody,
} from '@kometio/api-contracts';
import { request } from './http-client';

async function requestSite(
  path: string,
  init?: RequestInit,
): Promise<SiteRecord> {
  return siteRecordSchema.parse(await request(path, init));
}

/**
 * No id: which site this deployment edits is the API's to resolve, not the
 * browser's to know. It used to come from `VITE_DEFAULT_SITE_ID`, baked
 * into this bundle at image build time — which could never match a site the
 * first-run wizard creates afterwards.
 */
export function getCurrentSite(): Promise<SiteRecord> {
  return requestSite('/sites/current');
}

export type UpdateBusinessInfoInput = UpdateBusinessInfoBody;

export function updateBusinessInfo(
  id: string,
  input: UpdateBusinessInfoInput,
): Promise<SiteRecord> {
  return requestSite(`/sites/${id}/business-info`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export type UpdateGeneralSettingsInput = UpdateGeneralSettingsBody;

export function updateGeneralSettings(
  id: string,
  input: UpdateGeneralSettingsInput,
): Promise<SiteRecord> {
  return requestSite(`/sites/${id}/general-settings`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export type UpdateSeoSettingsInput = UpdateSeoSettingsBody;

export function updateSeoSettings(
  id: string,
  input: UpdateSeoSettingsInput,
): Promise<SiteRecord> {
  return requestSite(`/sites/${id}/seo-settings`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export type UpdateFormSubmissionRetentionInput =
  UpdateFormSubmissionRetentionBody;

export function updateFormSubmissionRetention(
  id: string,
  input: UpdateFormSubmissionRetentionInput,
): Promise<SiteRecord> {
  return requestSite(`/sites/${id}/form-submission-retention`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** How many answers a retention of this many days would delete at its next clean-up. */
export async function countSubmissionsOlderThan(
  siteId: string,
  olderThanDays: number,
): Promise<number> {
  const params = new URLSearchParams({ olderThanDays: String(olderThanDays) });
  return formSubmissionCountSchema.parse(
    await request(
      `/sites/${siteId}/form-submissions/count?${params.toString()}`,
    ),
  ).count;
}

export function updateLocaleSettings(
  id: string,
  input: UpdateLocaleSettingsBody,
): Promise<SiteRecord> {
  return requestSite(`/sites/${id}/locale-settings`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function updateThemeSettings(
  id: string,
  input: UpdateThemeSettingsBody,
): Promise<SiteRecord> {
  return requestSite(`/sites/${id}/theme-settings`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function updateCookieBannerSettings(
  id: string,
  input: UpdateCookieBannerSettingsBody,
): Promise<SiteRecord> {
  return requestSite(`/sites/${id}/cookie-banner-settings`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export type UpdateThemePackageInput = UpdateThemePackageBody;

export function updateThemePackage(
  id: string,
  input: UpdateThemePackageInput,
): Promise<SiteRecord> {
  return requestSite(`/sites/${id}/theme-package`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function listAvailableThemes(): Promise<AvailableTheme[]> {
  return availableThemesResponseSchema.parse(
    await request('/sites/themes/available'),
  );
}

export type UpdateThemeTokensInput = UpdateThemeTokensBody;

export function updateThemeTokens(
  id: string,
  input: UpdateThemeTokensInput,
): Promise<SiteRecord> {
  return requestSite(`/sites/${id}/theme-tokens`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
