import { describe, expect, it } from 'vitest';
import { SiteLayoutSection } from '@kometio/domain-core';
import { getPublishedSiteChrome } from './get-published-site-chrome.use-case';
import {
  InMemoryTaxonomyRepository,
  InMemoryPageGroupRepository,
  InMemoryPageTranslationRepository,
  InMemoryReusableSectionRepository,
  InMemorySiteLayoutSectionRepository,
  InMemorySiteRepository,
  InMemorySiteThemeBlockStylesRepository,
  buildSite,
} from '@kometio/testing';

describe('getPublishedSiteChrome', () => {
  const tenantId = 'tenant-1';

  function setup() {
    const siteRepository = new InMemorySiteRepository();
    const siteLayoutSectionRepository =
      new InMemorySiteLayoutSectionRepository();
    const siteThemeBlockStylesRepository =
      new InMemorySiteThemeBlockStylesRepository();
    const pageTranslationRepository = new InMemoryPageTranslationRepository();
    const pageGroupRepository = new InMemoryPageGroupRepository();
    return {
      siteRepository,
      siteLayoutSectionRepository,
      siteThemeBlockStylesRepository,
      pageTranslationRepository,
      pageGroupRepository,
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      reusableSectionRepository: new InMemoryReusableSectionRepository(),
    };
  }

  function seedSite(siteRepository: InMemorySiteRepository) {
    return siteRepository.add(
      buildSite({ tenantId, name: 'Sito di prova', createdAt: new Date() }),
    );
  }

  it('returns null for a domain that matches no site — no page lookup needed at all', async () => {
    const deps = setup();

    const result = await getPublishedSiteChrome(deps, {
      tenantId,
      domain: 'nope.example.com',
      locale: 'it',
    });

    expect(result).toBeNull();
  });

  it('returns the site plus header/footer, with no page in the picture', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const header = SiteLayoutSection.create({
      id: 'header-1',
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });
    header.saveDraft([{ type: 'Header', props: {} }]);
    header.publish();
    await deps.siteLayoutSectionRepository.add(header);

    const result = await getPublishedSiteChrome(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
    });

    expect(result?.header).toEqual([{ type: 'Header', props: {} }]);
    expect(result?.footer).toBeNull();
    expect(result?.site.name).toBe('Sito di prova');
  });

  it('returns null header/footer when neither has ever been configured for this locale', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = await getPublishedSiteChrome(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
    });

    expect(result?.header).toBeNull();
    expect(result?.footer).toBeNull();
    expect(result?.headerSticky).toBe(false);
  });
});
