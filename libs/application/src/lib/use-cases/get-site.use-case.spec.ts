import { SiteNotFoundError } from '@kometio/domain-core';
import {
  buildSite,
  InMemorySiteRepository,
  InMemorySiteThemeBlockStylesRepository,
} from '@kometio/testing';
import { describe, expect, it } from 'vitest';
import {
  getSite,
  listAvailableThemes,
  listSiteThemeBlockStyles,
} from './get-site.use-case';

describe('getSite', () => {
  it("finds the tenant's own site, and nothing of another tenant's", async () => {
    const siteRepository = new InMemorySiteRepository(buildSite());

    expect(
      (
        await getSite(
          { siteRepository },
          { tenantId: 'tenant-1', siteId: 'site-1' },
        )
      ).id,
    ).toBe('site-1');
    await expect(
      getSite({ siteRepository }, { tenantId: 'tenant-2', siteId: 'site-1' }),
    ).rejects.toBeInstanceOf(SiteNotFoundError);
  });
});

describe('listSiteThemeBlockStyles', () => {
  it('reads the overrides beside the site, by block type and variant', async () => {
    const siteThemeBlockStylesRepository =
      new InMemorySiteThemeBlockStylesRepository();
    await siteThemeBlockStylesRepository.upsert(
      'tenant-1',
      'site-1',
      'Button',
      'default',
      { base: { color: '#112233' } },
    );

    expect(
      await listSiteThemeBlockStyles(
        { siteThemeBlockStylesRepository },
        { tenantId: 'tenant-1', siteId: 'site-1' },
      ),
    ).toEqual({ Button: { default: { base: { color: '#112233' } } } });
  });
});

describe('listAvailableThemes', () => {
  it('asks the catalogue', async () => {
    const themes = [{ name: 'classic', uploaded: false }];
    expect(
      await listAvailableThemes({
        themeCatalog: { listAvailableThemes: async () => themes },
      }),
    ).toBe(themes);
  });
});
