import { type Site } from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';
import {
  detectKnownTrackers,
  type ThemeSettings,
  type TrackerScriptEntry,
  type TrackerScriptPlacement,
} from '@kometio/shared-types';
import { requireSite } from './require-site';

export interface UpdateSiteThemeSettingsDeps {
  siteRepository: SiteRepositoryPort;
}

export interface UpdateSiteThemeSettingsInput extends ThemeSettings {
  tenantId: string;
  siteId: string;
}

function extractKnownTrackers(
  html: string | null,
  placement: TrackerScriptPlacement,
): { remainingScript: string | null; extracted: TrackerScriptEntry[] } {
  const { detected, remainingHtml } = detectKnownTrackers(html ?? '');
  return {
    remainingScript: remainingHtml || null,
    extracted: detected.map((tracker) => ({
      id: crypto.randomUUID(),
      label: tracker.vendor,
      category: tracker.category,
      placement,
      html: tracker.html,
    })),
  };
}

/**
 * Runs the signature detector (docs/adr/0039) on every save: a known
 * vendor (GTM/GA4/Meta Pixel) pasted into the legacy free-text
 * headScript/bodyScript fields is automatically moved into the
 * categorized `trackerScripts` list instead of staying an always-on,
 * ungated blob — the user asked for this to happen "on its own", not via
 * a manual migration step.
 */
export async function updateSiteThemeSettings(
  deps: UpdateSiteThemeSettingsDeps,
  input: UpdateSiteThemeSettingsInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  const head = extractKnownTrackers(input.headScript, 'head');
  const body = extractKnownTrackers(input.bodyScript, 'body');

  site.updateThemeSettings({
    primaryColor: input.primaryColor,
    secondaryColor: input.secondaryColor,
    fontFamily: input.fontFamily,
    customCss: input.customCss,
    contentWidth: input.contentWidth,
    headScript: head.remainingScript,
    bodyScript: body.remainingScript,
    faviconUrl: input.faviconUrl,
    overridesEnabled: input.overridesEnabled,
    allowedTrackerDomains: input.allowedTrackerDomains,
    trackerScripts: [
      ...input.trackerScripts,
      ...head.extracted,
      ...body.extracted,
    ],
  });
  await deps.siteRepository.save(site);

  return site;
}
