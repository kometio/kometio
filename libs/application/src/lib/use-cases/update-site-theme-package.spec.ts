import { describe, expect, it } from 'vitest';
import { InvalidThemeNameError, SiteNotFoundError } from '@kometio/domain-core';
import { updateSiteThemePackage } from './update-site-theme-package.use-case';
import {
  InMemorySiteRepository,
  InMemoryThemeCatalog,
  buildSite,
} from '@kometio/testing';

describe('updateSiteThemePackage', () => {
  const tenantId = 'tenant-1';
  const otherTenantId = 'tenant-2';

  function setup() {
    const siteRepository = new InMemorySiteRepository();
    const themeCatalog = new InMemoryThemeCatalog([
      { name: 'classic', uploaded: false },
      { name: 'docs-showcase', uploaded: false },
    ]);
    return { siteRepository, themeCatalog };
  }

  async function seedSite(siteRepository: InMemorySiteRepository) {
    const site = buildSite({
      tenantId,
      name: 'Il mio sito',
      createdAt: new Date(),
    });
    await siteRepository.add(site);
    return site;
  }

  it('switches to a different bundled theme', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const updated = await updateSiteThemePackage(deps, {
      tenantId,
      siteId: 'site-1',
      themeName: 'docs-showcase',
    });

    expect(updated.themeName).toBe('docs-showcase');
  });

  it('throws SiteNotFoundError for a nonexistent site', async () => {
    const deps = setup();

    await expect(
      updateSiteThemePackage(deps, {
        tenantId,
        siteId: 'does-not-exist',
        themeName: 'classic',
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('does not update a site belonging to a different tenant', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    await expect(
      updateSiteThemePackage(deps, {
        tenantId: otherTenantId,
        siteId: 'site-1',
        themeName: 'docs-showcase',
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('rejects a themeName this deployment does not bundle', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    await expect(
      updateSiteThemePackage(deps, {
        tenantId,
        siteId: 'site-1',
        themeName: 'nonexistent-theme',
      }),
    ).rejects.toThrow(InvalidThemeNameError);
  });
});
