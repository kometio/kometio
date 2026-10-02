import { describe, expect, it } from 'vitest';
import { Site, SiteLayoutSection } from '@kometio/domain-core';
import type { SiteLayoutSectionKind } from '@kometio/shared-types';
import { resolveSiteChrome } from './resolve-site-chrome';
import {
  InMemoryTaxonomyRepository,
  InMemoryPageGroupRepository,
  InMemoryPageTranslationRepository,
  InMemoryReusableSectionRepository,
  InMemorySiteLayoutSectionRepository,
  InMemorySiteThemeBlockStylesRepository,
  buildSite,
} from '@kometio/testing';

describe('resolveSiteChrome', () => {
  const tenantId = 'tenant-1';

  function seedSite(
    overrides: Partial<Parameters<typeof Site.fromProps>[0]> = {},
  ) {
    return buildSite({
      tenantId,
      name: 'Sito di prova',
      enabledLocales: ['it', 'en'],
      createdAt: new Date(),
      ...overrides,
    });
  }

  async function seedPublishedSection(
    repository: InMemorySiteLayoutSectionRepository,
    input: {
      locale: string;
      kind: SiteLayoutSectionKind;
      content: unknown[];
    },
  ) {
    const section = SiteLayoutSection.create({
      id: `${input.kind}-${input.locale}`,
      tenantId,
      siteId: 'site-1',
      locale: input.locale,
      kind: input.kind,
    });
    const draft = SiteLayoutSection.fromProps({
      ...section.toProps(),
      content: input.content as never,
    });
    const published = SiteLayoutSection.fromProps({
      ...draft.toProps(),
      status: 'published',
      publishedContent: input.content as never,
    });
    await repository.add(published);
  }

  it('returns the header/footer created for the exact requested locale, unchanged', async () => {
    const repository = new InMemorySiteLayoutSectionRepository();
    const site = seedSite();
    await seedPublishedSection(repository, {
      locale: 'it',
      kind: 'header',
      content: [{ type: 'Nav', props: {} }],
    });

    const chrome = await resolveSiteChrome(
      {
        siteLayoutSectionRepository: repository,
        siteThemeBlockStylesRepository:
          new InMemorySiteThemeBlockStylesRepository(),
        pageTranslationRepository: new InMemoryPageTranslationRepository(),
        pageGroupRepository: new InMemoryPageGroupRepository(),
        reusableSectionRepository: new InMemoryReusableSectionRepository(),
        taxonomyRepository: new InMemoryTaxonomyRepository(),
      },
      tenantId,
      site,
      'it',
    );

    expect(chrome.header).toEqual([{ type: 'Nav', props: {} }]);
  });

  it("falls back to the site's default locale when the requested locale has no header/footer of its own", async () => {
    // Regression: a page in a locale whose header/footer was never created
    // (only the default locale's was) rendered with NEITHER — found live by
    // opening the English "about-us" page on a site set up only in Italian.
    const repository = new InMemorySiteLayoutSectionRepository();
    const site = seedSite({
      defaultLocale: 'it',
      enabledLocales: ['it', 'en'],
    });
    await seedPublishedSection(repository, {
      locale: 'it',
      kind: 'header',
      content: [{ type: 'Nav', props: { label: 'IT nav' } }],
    });
    await seedPublishedSection(repository, {
      locale: 'it',
      kind: 'footer',
      content: [{ type: 'Text', props: { body: 'IT footer' } }],
    });

    const chrome = await resolveSiteChrome(
      {
        siteLayoutSectionRepository: repository,
        siteThemeBlockStylesRepository:
          new InMemorySiteThemeBlockStylesRepository(),
        pageTranslationRepository: new InMemoryPageTranslationRepository(),
        pageGroupRepository: new InMemoryPageGroupRepository(),
        reusableSectionRepository: new InMemoryReusableSectionRepository(),
        taxonomyRepository: new InMemoryTaxonomyRepository(),
      },
      tenantId,
      site,
      'en',
    );

    expect(chrome.header).toEqual([
      { type: 'Nav', props: { label: 'IT nav' } },
    ]);
    expect(chrome.footer).toEqual([
      { type: 'Text', props: { body: 'IT footer' } },
    ]);
  });

  it('stays null when neither the requested locale nor the default locale has a section', async () => {
    const repository = new InMemorySiteLayoutSectionRepository();
    const site = seedSite({
      defaultLocale: 'it',
      enabledLocales: ['it', 'en'],
    });

    const chrome = await resolveSiteChrome(
      {
        siteLayoutSectionRepository: repository,
        siteThemeBlockStylesRepository:
          new InMemorySiteThemeBlockStylesRepository(),
        pageTranslationRepository: new InMemoryPageTranslationRepository(),
        pageGroupRepository: new InMemoryPageGroupRepository(),
        reusableSectionRepository: new InMemoryReusableSectionRepository(),
        taxonomyRepository: new InMemoryTaxonomyRepository(),
      },
      tenantId,
      site,
      'en',
    );

    expect(chrome.header).toBeNull();
    expect(chrome.footer).toBeNull();
  });

  it('a locale with its own DRAFT-only section (never published) still falls back for the published (non-preview) read', async () => {
    const repository = new InMemorySiteLayoutSectionRepository();
    const site = seedSite({
      defaultLocale: 'it',
      enabledLocales: ['it', 'en'],
    });
    await seedPublishedSection(repository, {
      locale: 'it',
      kind: 'header',
      content: [{ type: 'Nav', props: { label: 'IT nav' } }],
    });
    // 'en' has its OWN section row, but it was never published — the
    // fallback only ever triggers on a missing row, never on an unpublished
    // one (that's resolveContent's own published-only gate, unrelated to
    // locale fallback).
    const enDraft = SiteLayoutSection.create({
      id: 'header-en',
      tenantId,
      siteId: 'site-1',
      locale: 'en',
      kind: 'header',
    });
    await repository.add(enDraft);

    const chrome = await resolveSiteChrome(
      {
        siteLayoutSectionRepository: repository,
        siteThemeBlockStylesRepository:
          new InMemorySiteThemeBlockStylesRepository(),
        pageTranslationRepository: new InMemoryPageTranslationRepository(),
        pageGroupRepository: new InMemoryPageGroupRepository(),
        reusableSectionRepository: new InMemoryReusableSectionRepository(),
        taxonomyRepository: new InMemoryTaxonomyRepository(),
      },
      tenantId,
      site,
      'en',
    );

    expect(chrome.header).toBeNull();
  });

  it("preview mode reads the fallback section's draft content regardless of its own status", async () => {
    const repository = new InMemorySiteLayoutSectionRepository();
    const site = seedSite({
      defaultLocale: 'it',
      enabledLocales: ['it', 'en'],
    });
    const itDraft = SiteLayoutSection.create({
      id: 'header-it',
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
      content: [{ type: 'Nav', props: { label: 'bozza IT' } }],
    });
    await repository.add(itDraft);

    const chrome = await resolveSiteChrome(
      {
        siteLayoutSectionRepository: repository,
        siteThemeBlockStylesRepository:
          new InMemorySiteThemeBlockStylesRepository(),
        pageTranslationRepository: new InMemoryPageTranslationRepository(),
        pageGroupRepository: new InMemoryPageGroupRepository(),
        reusableSectionRepository: new InMemoryReusableSectionRepository(),
        taxonomyRepository: new InMemoryTaxonomyRepository(),
      },
      tenantId,
      site,
      'en',
      { preview: true },
    );

    expect(chrome.header).toEqual([
      { type: 'Nav', props: { label: 'bozza IT' } },
    ]);
  });
});
