import type { SiteRecord } from '@kometio/api-contracts';

/**
 * How many of the site's scripts are waiting for a consent that can never
 * come: they run only once a visitor has accepted their category in the
 * cookie banner, and with the banner off nobody is ever asked.
 *
 * "Necessary" scripts are not gated (docs/adr/0039), so they are not
 * waiting. Worked out from the site record — what the pages that show it
 * already hold — so it needs nothing from the server.
 */
export function scriptsWaitingForConsent(
  site: Pick<SiteRecord, 'themeTrackerScripts' | 'cookieBannerSettings'>,
): number {
  if (site.cookieBannerSettings.enabled) return 0;
  return site.themeTrackerScripts.filter(
    (script) => script.category !== 'necessary',
  ).length;
}
