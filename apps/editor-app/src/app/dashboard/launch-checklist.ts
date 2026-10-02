import type { SiteRecord } from '@kometio/api-contracts';
import type { DashboardStatsDto } from '../../lib/dashboard-api-client';
import { scriptsWaitingForConsent } from '../settings/consent-warning';

/**
 * One thing a site needs before it is ready to be found, and where to go
 * to do it. `to` is a route literal so the link is checked against the
 * routes that exist.
 */
export interface LaunchChecklistItem {
  id: 'name' | 'domain' | 'page' | 'cookies' | 'indexing';
  done: boolean;
  to: '/settings/general' | '/pages' | '/settings/cookies' | '/settings/seo';
  /** Only on the cookie banner's item: how many scripts wait for it, which is what makes turning it on urgent rather than merely advisable. */
  waitingScripts?: number;
}

/**
 * What a site is missing before it goes online, worked out from what the
 * dashboard already has — the site record and the page counts — so it
 * needs nothing new from the server.
 *
 * Each one is a fact about the site, not a box somebody ticked: publishing
 * a page is what makes "publish a page" done, and there is no way to mark
 * it done without the site being so.
 */
export function launchChecklist(
  site: Pick<
    SiteRecord,
    | 'name'
    | 'domain'
    | 'cookieBannerSettings'
    | 'searchEngineIndexingEnabled'
    | 'themeTrackerScripts'
  >,
  stats: Pick<DashboardStatsDto, 'pages'>,
): LaunchChecklistItem[] {
  return [
    { id: 'name', done: site.name.trim() !== '', to: '/settings/general' },
    {
      id: 'domain',
      done: (site.domain ?? '').trim() !== '',
      to: '/settings/general',
    },
    { id: 'page', done: stats.pages.publishedCount > 0, to: '/pages' },
    {
      id: 'cookies',
      done: site.cookieBannerSettings.enabled,
      to: '/settings/cookies',
      waitingScripts: scriptsWaitingForConsent(site),
    },
    {
      id: 'indexing',
      done: site.searchEngineIndexingEnabled,
      to: '/settings/seo',
    },
  ];
}
