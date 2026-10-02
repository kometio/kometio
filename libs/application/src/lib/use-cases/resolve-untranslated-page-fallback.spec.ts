import { describe, expect, it } from 'vitest';
import { Site, type PageGroup } from '@kometio/domain-core';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { publishPageTranslation } from './publish-page-translation.use-case';
import { resolveUntranslatedPageFallback } from './resolve-untranslated-page-fallback.use-case';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemorySearchPort,
  InMemorySiteRepository,
  InMemoryTaxonomyRepository,
  buildSite,
  InMemoryCollectionRepository,
} from '@kometio/testing';

describe('resolveUntranslatedPageFallback', () => {
  const tenantId = 'tenant-1';

  function setup() {
    const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
    const pageGroupRepository = new InMemoryPageGroupRepository(
      pageGroupVersionRepository,
    );
    const pageTranslationVersionRepository =
      new InMemoryPageTranslationVersionRepository();
    const pageTranslationRepository = new InMemoryPageTranslationRepository(
      pageTranslationVersionRepository,
    );
    const siteRepository = new InMemorySiteRepository();
    return {
      pageGroupRepository,
      pageGroupVersionRepository,
      pageTranslationRepository,
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      collectionRepository: new InMemoryCollectionRepository(),
      pageTranslationVersionRepository,
      siteRepository,
      searchPort: new InMemorySearchPort(),
      reusableSectionRepository: new InMemoryReusableSectionRepository(),
    };
  }

  async function seedSite(
    siteRepository: InMemorySiteRepository,
    overrides: Partial<Parameters<typeof Site.fromProps>[0]> = {},
  ) {
    const site = buildSite({
      tenantId,
      name: 'Sito di prova',
      enabledLocales: ['it', 'en'],
      createdAt: new Date(),
      ...overrides,
    });
    await siteRepository.add(site);
    return site;
  }

  async function createGroup(deps: ReturnType<typeof setup>) {
    return createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      content: [{ type: 'Hero', props: { title: 'x', subtitle: 'sub' } }],
      createdBy: 'user-1',
    });
  }

  async function createAndPublishTranslation(
    deps: ReturnType<typeof setup>,
    group: PageGroup,
    input: { locale: string; slug: string; title: string },
  ) {
    const translation = await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale: input.locale,
      slug: input.slug,
      seoMeta: { title: input.title, description: '' },
      createdBy: 'user-1',
    });
    return publishPageTranslation(deps, {
      tenantId,
      pageTranslationId: translation.id,
      actorUserId: null,
    });
  }

  it("falls back to the default-locale page with the same slug when the requested locale has none, and the site is set to 'redirect-to-default'", async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const group = await createGroup(deps);
    await createAndPublishTranslation(deps, group, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });

    const result = await resolveUntranslatedPageFallback(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'en',
      segments: ['chi-siamo'],
    });

    expect(result).toEqual({ locale: 'it', segments: ['chi-siamo'] });
  });

  it("returns null when the site is set to 'not-available'", async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, {
      untranslatedPageFallback: 'not-available',
    });
    const group = await createGroup(deps);
    await createAndPublishTranslation(deps, group, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });

    const result = await resolveUntranslatedPageFallback(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'en',
      segments: ['chi-siamo'],
    });

    expect(result).toBeNull();
  });

  it('falls back to another enabled locale with the same slug when the default-locale sibling was deleted', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, {
      enabledLocales: ['it', 'en', 'fr'],
    });
    const group = await createGroup(deps);
    // No 'it' translation at all — as if the group's default-locale
    // translation had been deleted while its 'en' sibling survived.
    await createAndPublishTranslation(deps, group, {
      locale: 'en',
      slug: 'chi-siamo',
      title: 'About us',
    });

    const result = await resolveUntranslatedPageFallback(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'fr',
      segments: ['chi-siamo'],
    });

    expect(result).toEqual({ locale: 'en', segments: ['chi-siamo'] });
  });

  it('returns null when the default-locale page with that slug does not exist either', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = await resolveUntranslatedPageFallback(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'en',
      segments: ['nobody-home'],
    });

    expect(result).toBeNull();
  });

  it('returns null when the default-locale page with that slug exists but is only a draft', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const group = await createGroup(deps);
    await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale: 'it',
      slug: 'chi-siamo',
      seoMeta: { title: 'Chi siamo', description: '' },
      createdBy: 'user-1',
    });

    const result = await resolveUntranslatedPageFallback(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'en',
      segments: ['chi-siamo'],
    });

    expect(result).toBeNull();
  });

  it('returns null when the requested locale already IS the default locale — nothing more "default" to fall back to', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = await resolveUntranslatedPageFallback(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
      segments: ['chi-siamo'],
    });

    expect(result).toBeNull();
  });

  it('returns null when the requested locale is not an enabled locale for the site at all (made-up URL segment, not an untranslated page)', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const group = await createGroup(deps);
    await createAndPublishTranslation(deps, group, {
      locale: 'it',
      slug: 'home',
      title: 'Home',
    });

    const result = await resolveUntranslatedPageFallback(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'qualcosa-a-caso',
      segments: ['home'],
    });

    expect(result).toBeNull();
  });

  it('returns null when the domain does not resolve to any site', async () => {
    const deps = setup();

    const result = await resolveUntranslatedPageFallback(deps, {
      tenantId,
      domain: 'nobody.example',
      locale: 'en',
      segments: ['chi-siamo'],
    });

    expect(result).toBeNull();
  });
});
