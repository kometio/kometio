import { describe, expect, it } from 'vitest';
import { DEFAULT_VARIANT } from '@kometio/shared-types';
import { SiteNotFoundError } from '@kometio/domain-core';
import {
  InMemorySiteRepository,
  InMemorySiteThemeBlockStylesRepository,
  buildSite,
} from '@kometio/testing';
import { updateSiteThemeTokens } from './update-site-theme-tokens.use-case';

describe('updateSiteThemeTokens', () => {
  const tenantId = 'tenant-1';

  function setup() {
    const siteRepository = new InMemorySiteRepository();
    const siteThemeBlockStylesRepository =
      new InMemorySiteThemeBlockStylesRepository();
    return { siteRepository, siteThemeBlockStylesRepository };
  }

  async function createSite(deps: ReturnType<typeof setup>) {
    const site = buildSite({ tenantId, name: 'Il mio sito', domain: null });
    await deps.siteRepository.add(site);
    return site;
  }

  it('saves the override for the given block type', async () => {
    const deps = setup();
    await createSite(deps);

    await updateSiteThemeTokens(deps, {
      tenantId,
      siteId: 'site-1',
      blockType: 'Button',
      variant: DEFAULT_VARIANT,
      style: {
        base: {
          borderRadius: '9999px',
          paddingX: '1.5rem',
          paddingY: '0.75rem',
        },
      },
    });

    const persisted = await deps.siteThemeBlockStylesRepository.listBySite(
      tenantId,
      'site-1',
    );
    expect(persisted).toEqual({
      Button: {
        default: {
          base: {
            borderRadius: '9999px',
            paddingX: '1.5rem',
            paddingY: '0.75rem',
          },
        },
      },
    });
  });

  it('leaves other block types untouched', async () => {
    const deps = setup();
    await createSite(deps);
    await deps.siteThemeBlockStylesRepository.upsert(
      tenantId,
      'site-1',
      'Banner',
      DEFAULT_VARIANT,
      { base: { backgroundColor: '#000000' } },
    );

    await updateSiteThemeTokens(deps, {
      tenantId,
      siteId: 'site-1',
      blockType: 'Button',
      variant: DEFAULT_VARIANT,
      style: { base: { borderRadius: '9999px' } },
    });

    const persisted = await deps.siteThemeBlockStylesRepository.listBySite(
      tenantId,
      'site-1',
    );
    expect(persisted).toEqual({
      Banner: { default: { base: { backgroundColor: '#000000' } } },
      Button: { default: { base: { borderRadius: '9999px' } } },
    });
  });

  it('throws SiteNotFoundError for a nonexistent site', async () => {
    const deps = setup();

    await expect(
      updateSiteThemeTokens(deps, {
        tenantId,
        siteId: 'does-not-exist',
        blockType: 'Button',
        variant: DEFAULT_VARIANT,
        style: { base: { borderRadius: '6px' } },
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });
});
