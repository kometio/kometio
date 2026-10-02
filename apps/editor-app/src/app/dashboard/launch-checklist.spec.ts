import { describe, expect, it } from 'vitest';
import { buildSiteRecord } from '@kometio/testing/records';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import { launchChecklist } from './launch-checklist';

const readySite = buildSiteRecord({
  name: 'Forno Esempio',
  domain: 'forno.esempio.test',
  searchEngineIndexingEnabled: true,
  cookieBannerSettings: { ...DEFAULT_COOKIE_BANNER_SETTINGS, enabled: true },
});
const published = { pages: { publishedCount: 3, draftCount: 0 } };

function doneIds(items: ReturnType<typeof launchChecklist>) {
  return items.filter((item) => item.done).map((item) => item.id);
}

describe('launchChecklist', () => {
  it('has every item done for a site that is ready', () => {
    expect(doneIds(launchChecklist(readySite, published))).toEqual([
      'name',
      'domain',
      'page',
      'cookies',
      'indexing',
    ]);
  });

  it('is done by the fact, not by a tick: a domain of spaces is no domain', () => {
    const items = launchChecklist(
      { ...readySite, name: '   ', domain: '  ' },
      published,
    );

    expect(doneIds(items)).toEqual(['page', 'cookies', 'indexing']);
  });

  it('has no domain when the site has none', () => {
    expect(
      doneIds(launchChecklist({ ...readySite, domain: null }, published)),
    ).not.toContain('domain');
  });

  it('counts a published page, and a draft is not one', () => {
    expect(
      doneIds(
        launchChecklist(readySite, {
          pages: { publishedCount: 0, draftCount: 4 },
        }),
      ),
    ).not.toContain('page');
  });

  it('is not done for a banner that is off, or a site closed to search engines', () => {
    const items = launchChecklist(
      {
        ...readySite,
        searchEngineIndexingEnabled: false,
        cookieBannerSettings: {
          ...DEFAULT_COOKIE_BANNER_SETTINGS,
          enabled: false,
        },
      },
      published,
    );

    expect(doneIds(items)).toEqual(['name', 'domain', 'page']);
  });

  it('sends each item to the screen where it is done', () => {
    const items = launchChecklist(readySite, published);

    expect(Object.fromEntries(items.map((item) => [item.id, item.to]))).toEqual(
      {
        name: '/settings/general',
        domain: '/settings/general',
        page: '/pages',
        cookies: '/settings/cookies',
        indexing: '/settings/seo',
      },
    );
  });

  // A banner that is off is advisable; a banner that is off while scripts
  // wait for its consent is a fault, and says so on the same line.
  it('says how many scripts are waiting when the banner is off', () => {
    const cookies = (
      site: Parameters<typeof launchChecklist>[0],
    ): number | undefined =>
      launchChecklist(site, published).find((item) => item.id === 'cookies')
        ?.waitingScripts;
    const script = {
      id: 's',
      label: 'GA',
      category: 'measurement' as const,
      placement: 'head' as const,
      html: '<script></script>',
    };
    const bannerOff = {
      ...DEFAULT_COOKIE_BANNER_SETTINGS,
      enabled: false,
    };

    expect(
      cookies({
        ...readySite,
        cookieBannerSettings: bannerOff,
        themeTrackerScripts: [script, { ...script, id: 't' }],
      }),
    ).toBe(2);
    expect(cookies({ ...readySite, themeTrackerScripts: [script] })).toBe(0);
    expect(
      cookies({
        ...readySite,
        cookieBannerSettings: bannerOff,
        themeTrackerScripts: [{ ...script, category: 'necessary' }],
      }),
    ).toBe(0);
  });
});
