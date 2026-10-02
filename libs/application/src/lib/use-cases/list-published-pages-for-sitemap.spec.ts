import { describe, expect, it } from 'vitest';
import { Site, Taxonomy, Term, User } from '@kometio/domain-core';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { publishPageTranslation } from './publish-page-translation.use-case';
import { listPublishedPagesForSitemap } from './list-published-pages-for-sitemap.use-case';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemorySearchPort,
  InMemorySiteRepository,
  InMemoryTaxonomyRepository,
  InMemoryUserRepository,
  buildSite,
  InMemoryCollectionRepository,
  buildCollection,
} from '@kometio/testing';

describe('listPublishedPagesForSitemap', () => {
  const tenantId = 'tenant-1';

  function setup() {
    const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
    const pageTranslationVersionRepository =
      new InMemoryPageTranslationVersionRepository();
    return {
      pageGroupRepository: new InMemoryPageGroupRepository(
        pageGroupVersionRepository,
      ),
      pageGroupVersionRepository,
      pageTranslationRepository: new InMemoryPageTranslationRepository(
        pageTranslationVersionRepository,
      ),
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      collectionRepository: new InMemoryCollectionRepository(
        buildCollection({ id: 'news' }),
      ),
      userRepository: new InMemoryUserRepository(),
      pageTranslationVersionRepository,
      siteRepository: new InMemorySiteRepository(),
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
      createdAt: new Date(),
      ...overrides,
    });
    await siteRepository.add(site);
    return site;
  }

  async function createGroupAndTranslation(
    deps: ReturnType<typeof setup>,
    locale: string,
    slug: string,
    parentGroupId: string | null = null,
  ) {
    const group = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      parentId: parentGroupId,
      createdBy: 'user-1',
    });
    const translation = await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale,
      slug,
      seoMeta: { title: slug, description: '' },
      createdBy: 'user-1',
    });
    return { group, translation };
  }

  async function createAndPublish(
    deps: ReturnType<typeof setup>,
    slug: string,
  ) {
    const { group, translation } = await createGroupAndTranslation(
      deps,
      'it',
      slug,
    );
    await publishPageTranslation(deps, {
      tenantId,
      pageTranslationId: translation.id,
      actorUserId: null,
    });
    return group;
  }

  it('lists only published pages for the domain, skipping drafts', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    await createAndPublish(deps, 'chi-siamo');
    await createAndPublish(deps, 'contatti');
    await createGroupAndTranslation(deps, 'it', 'bozza');

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.items.map((entry) => entry.slug).sort()).toEqual([
      'chi-siamo',
      'contatti',
    ]);
  });

  async function seedTerm(
    deps: ReturnType<typeof setup>,
    options: {
      prefix: string | null;
      slugs: Record<string, string>;
      landingPageGroupId?: string;
      noindex?: boolean;
    },
  ) {
    const taxonomy = Taxonomy.create({
      id: 'taxonomy-1',
      tenantId,
      siteId: 'site-1',
      prefix: options.prefix,
      name: { it: 'Categoria' },
    });
    await deps.taxonomyRepository.addTaxonomy(taxonomy);
    const term = Term.create({
      id: 'term-1',
      tenantId,
      siteId: 'site-1',
      taxonomyId: taxonomy.id,
      name: { it: 'Espresso' },
      slugs: options.slugs,
    });
    if (options.landingPageGroupId) {
      term.setLandingPage(options.landingPageGroupId);
    }
    if (options.noindex) {
      term.setNoindex(true);
    }
    await deps.taxonomyRepository.addTerm(term);
    return term;
  }

  /*
   * A term is an address a crawler should know about — that is the whole
   * argument for giving terms automatic routes (docs/adr/0064): a term
   * with no URL does not exist for a search engine.
   */
  it('lists a term at its own address, grouped by the term for hreflang', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { enabledLocales: ['it', 'en'] });
    await seedTerm(deps, {
      prefix: 'categoria',
      slugs: { it: 'espresso', en: 'espresso-machines' },
    });

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.items).toEqual([
      {
        slug: 'espresso',
        locale: 'it',
        groupId: 'term-1',
        ancestorSlugs: ['categoria'],
        updatedAt: expect.any(Date),
      },
      {
        slug: 'espresso-machines',
        locale: 'en',
        groupId: 'term-1',
        ancestorSlugs: ['categoria'],
        updatedAt: expect.any(Date),
      },
    ]);
  });

  /*
   * Listing an address in the map that invites crawlers in, and then
   * telling the crawler to go away once it arrives, wastes the visit and
   * contradicts the page itself.
   */
  it('leaves out a term kept out of search engines', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { enabledLocales: ['it'] });
    await seedTerm(deps, {
      prefix: 'categoria',
      slugs: { it: 'espresso' },
      noindex: true,
    });

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.items.filter((item) => item.slug === 'espresso')).toEqual(
      [],
    );
  });

  it('leaves out a language the term does not answer in', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { enabledLocales: ['it', 'en'] });
    await seedTerm(deps, { prefix: null, slugs: { it: 'espresso' } });

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.items).toEqual([
      {
        slug: 'espresso',
        locale: 'it',
        groupId: 'term-1',
        // Mounted at the site root, so nothing in front of the slug.
        ancestorSlugs: [],
        updatedAt: expect.any(Date),
      },
    ]);
  });

  /*
   * The other half of the 301 (docs/adr/0067): the old URL redirects, so
   * listing it would hand a crawler exactly the duplicate the redirect
   * exists to remove.
   */
  it('drops a page a term renders on its own address', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const kept = await createAndPublish(deps, 'contatti');
    const claimed = await createAndPublish(deps, 'chi-siamo');
    await seedTerm(deps, {
      prefix: 'categoria',
      slugs: { it: 'espresso' },
      landingPageGroupId: claimed.id,
    });

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.items.map((entry) => entry.slug).sort()).toEqual([
      'contatti',
      'espresso',
    ]);
    expect(result?.items.some((entry) => entry.groupId === kept.id)).toBe(true);
  });

  /*
   * The page still answers in a language the term does not reach — the
   * lookup keeps serving it there rather than redirecting into nothing
   * (docs/adr/0067) — so the sitemap must keep listing it there. Dropping
   * the whole group would hide a live URL.
   */
  it('keeps the claimed page listed in a language the term does not answer in', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { enabledLocales: ['it', 'en'] });
    const { group, translation } = await createGroupAndTranslation(
      deps,
      'it',
      'chi-siamo',
    );
    await publishPageTranslation(deps, {
      tenantId,
      pageTranslationId: translation.id,
      actorUserId: null,
    });
    const english = await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale: 'en',
      slug: 'about-us',
      seoMeta: { title: 'About us', description: '' },
      createdBy: 'user-1',
    });
    await publishPageTranslation(deps, {
      tenantId,
      pageTranslationId: english.id,
      actorUserId: null,
    });
    // The term answers in Italian only.
    await seedTerm(deps, {
      prefix: 'categoria',
      slugs: { it: 'espresso' },
      landingPageGroupId: group.id,
    });

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(
      result?.items.map((entry) => `${entry.locale}:${entry.slug}`).sort(),
    ).toEqual(['en:about-us', 'it:espresso']);
  });

  it('returns null when no site matches the domain', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'nobody-has-this.test',
    });

    expect(result).toBeNull();
  });

  it('returns an empty items array for a site with no published pages', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.items).toEqual([]);
  });

  it("includes the site's search engine indexing flag", async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { searchEngineIndexingEnabled: true });

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.searchEngineIndexingEnabled).toBe(true);
  });

  it('resolves ancestorSlugs for a nested page, even through an unpublished ancestor', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    // "Servizi" stays a draft — its slug is still a structural fact for
    // "Idraulica"'s canonical URL, independent of whether Servizi itself
    // is published yet.
    const { group: servizi } = await createGroupAndTranslation(
      deps,
      'it',
      'servizi',
    );
    const { translation: idraulica } = await createGroupAndTranslation(
      deps,
      'it',
      'idraulica',
      servizi.id,
    );
    await publishPageTranslation(deps, {
      tenantId,
      pageTranslationId: idraulica.id,
      actorUserId: null,
    });

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.items).toEqual([
      expect.objectContaining({
        slug: 'idraulica',
        ancestorSlugs: ['servizi'],
      }),
    ]);
  });

  it('skips a published leaf whose ancestor has no translation in the same locale (not actually reachable at a real URL)', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { enabledLocales: ['it', 'en'] });
    // "Servizi" only has an 'it' translation — an 'en' leaf under it would
    // 404 walking down (resolvePageGroupByPath needs an 'en' slug at every
    // level), so it must not appear in the sitemap even though it is
    // itself marked published.
    const { group: servizi } = await createGroupAndTranslation(
      deps,
      'it',
      'servizi',
    );
    const { translation: idraulicaEn } = await createGroupAndTranslation(
      deps,
      'en',
      'plumbing',
      servizi.id,
    );
    await publishPageTranslation(deps, {
      tenantId,
      pageTranslationId: idraulicaEn.id,
      actorUserId: null,
    });

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.items).toEqual([]);
  });

  it("includes the site's default locale, and each entry's locale/groupId", async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { defaultLocale: 'en' });
    const group = await createAndPublish(deps, 'chi-siamo');

    const result = await listPublishedPagesForSitemap(deps, {
      tenantId,
      domain: 'example.com',
    });

    expect(result?.defaultLocale).toBe('en');
    expect(result?.items[0]).toMatchObject({
      slug: 'chi-siamo',
      locale: 'it',
      groupId: group.id,
    });
  });

  describe('author pages', () => {
    async function seedAuthor(
      deps: ReturnType<typeof setup>,
      displayName = 'Giulia Rossi',
    ) {
      await deps.userRepository.add(
        User.create({
          id: 'user-1',
          tenantId,
          email: 'giulia@example.com',
          displayName,
          passwordHash: 'x',
          role: 'editor',
          slug: 'giulia-rossi',
        }),
      );
    }

    async function publishArticle(
      deps: ReturnType<typeof setup>,
      slug: string,
      collectionId: string | null,
    ) {
      const group = await createPageGroup(deps, {
        tenantId,
        siteId: 'site-1',
        collectionId,
        createdBy: 'user-1',
      });
      const translation = await createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: group.id,
        locale: 'it',
        slug,
        seoMeta: { title: slug, description: '' },
        createdBy: 'user-1',
      });
      await publishPageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: null,
      });
    }

    const authorItems = (items: { groupId: string }[]) =>
      items.filter((item) => item.groupId.startsWith('author:'));

    it('lists the page of someone who wrote an article, under the word of its language', async () => {
      const deps = setup();
      await seedSite(deps.siteRepository, { enabledLocales: ['it', 'en'] });
      await seedAuthor(deps);
      await publishArticle(deps, 'articolo', 'news');

      const result = await listPublishedPagesForSitemap(deps, {
        tenantId,
        domain: 'example.com',
      });

      // Only Italian: there is no English article, so no English page.
      expect(authorItems(result?.items ?? [])).toEqual([
        {
          slug: 'giulia-rossi',
          locale: 'it',
          groupId: 'author:user-1',
          ancestorSlugs: ['autore'],
          updatedAt: expect.any(Date),
        },
      ]);
    });

    it('lists no page for someone whose pages are not articles, or who has no name', async () => {
      const deps = setup();
      await seedSite(deps.siteRepository);
      await seedAuthor(deps);
      await publishArticle(deps, 'chi-siamo', null);
      expect(
        authorItems(
          (
            await listPublishedPagesForSitemap(deps, {
              tenantId,
              domain: 'example.com',
            })
          )?.items ?? [],
        ),
      ).toEqual([]);

      const nameless = setup();
      await seedSite(nameless.siteRepository);
      await seedAuthor(nameless, '');
      await publishArticle(nameless, 'articolo', 'news');
      expect(
        authorItems(
          (
            await listPublishedPagesForSitemap(nameless, {
              tenantId,
              domain: 'example.com',
            })
          )?.items ?? [],
        ),
      ).toEqual([]);
    });
  });
});
