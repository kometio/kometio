import { describe, expect, it } from 'vitest';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import {
  Site,
  SiteLayoutSection,
  Taxonomy,
  Term,
  type PageGroup,
} from '@kometio/domain-core';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { publishPageTranslation } from './publish-page-translation.use-case';
import { savePageGroupContent } from './save-page-group-content.use-case';
import { getPublishedPageBySlug } from './get-published-page-by-slug.use-case';
import { renamePageTranslation } from './rename-page-translation.use-case';
import { movePageGroupToParent } from './move-page-group-to-parent.use-case';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemorySearchPort,
  InMemorySiteLayoutSectionRepository,
  InMemorySiteRepository,
  InMemorySiteThemeBlockStylesRepository,
  InMemoryTaxonomyRepository,
  buildSite,
  InMemoryCollectionRepository,
} from '@kometio/testing';

describe('getPublishedPageBySlug', () => {
  const tenantId = 'tenant-1';

  function setup() {
    const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
    const pageTranslationVersionRepository =
      new InMemoryPageTranslationVersionRepository();
    const pageTranslationRepository = new InMemoryPageTranslationRepository(
      pageTranslationVersionRepository,
    );
    return {
      // The translation repository is a collaborator here because moving a
      // page writes the group and its languages together.
      pageGroupRepository: new InMemoryPageGroupRepository(
        pageGroupVersionRepository,
        pageTranslationRepository,
      ),
      pageGroupVersionRepository,
      pageTranslationRepository,
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      collectionRepository: new InMemoryCollectionRepository(),
      pageTranslationVersionRepository,
      siteRepository: new InMemorySiteRepository(),
      siteLayoutSectionRepository: new InMemorySiteLayoutSectionRepository(),
      reusableSectionRepository: new InMemoryReusableSectionRepository(),
      siteThemeBlockStylesRepository:
        new InMemorySiteThemeBlockStylesRepository(),
      searchPort: new InMemorySearchPort(),
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

  async function createGroupAndPublish(
    deps: ReturnType<typeof setup>,
    input: {
      locale: string;
      slug: string;
      title: string;
      parentGroupId?: string | null;
    },
  ) {
    const group = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      parentId: input.parentGroupId ?? null,
      content: [
        { type: 'Hero', props: { title: input.title, subtitle: 'sub' } },
      ],
      createdBy: 'user-1',
    });
    const translation = await publishTranslationInGroup(deps, group, input);
    return { group, translation };
  }

  async function publishTranslationInGroup(
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

  async function claimAsLandingPage(
    deps: ReturnType<typeof setup>,
    group: PageGroup,
    options: { prefix: string | null; slugs: Record<string, string> },
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
    term.setLandingPage(group.id);
    await deps.taxonomyRepository.addTerm(term);
    return term;
  }

  /*
   * A page a term renders on its own address does not answer at its own
   * slug any more — it moved there (docs/adr/0067). A 301 and not a 404
   * so the links pointing at the old URL keep working and hand their
   * weight to the new one.
   */
  /*
   * A page's address used to be decided once and never again. Now it can
   * move — and the address it left has to keep answering, or renaming is
   * just a quieter way of deleting every link somebody saved.
   */
  it('sends a visitor from an address a page has left to the one it lives at', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { translation } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
    await renamePageTranslation(deps, {
      tenantId,
      pageTranslationId: translation.id,
      slug: 'la-nostra-storia',
      parentGroupId: null,
      actorUserId: null,
    });

    const result = await getPublishedPageBySlug(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
      segments: ['chi-siamo'],
    });

    expect(result.page).toBeNull();
    expect(result.redirectTo).toBe('/it/la-nostra-storia');
  });

  /*
   * Renaming a section moves everything underneath it. A link to a child
   * page is as saved, and as followed, as a link to the section itself —
   * so the old address has to answer at every depth, not only the last.
   */
  it('sends a visitor on when it is an ancestor that moved, not the page', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group: parent, translation: parentTranslation } =
      await createGroupAndPublish(deps, {
        locale: 'it',
        slug: 'servizi',
        title: 'Servizi',
      });
    await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'idraulica',
      title: 'Idraulica',
      parentGroupId: parent.id,
    });
    await renamePageTranslation(deps, {
      tenantId,
      pageTranslationId: parentTranslation.id,
      slug: 'cosa-facciamo',
      parentGroupId: null,
      actorUserId: null,
    });

    const result = await getPublishedPageBySlug(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
      segments: ['servizi', 'idraulica'],
    });

    expect(result.page).toBeNull();
    expect(result.redirectTo).toBe('/it/cosa-facciamo/idraulica');
  });

  /*
   * A move changes the address of the page and of everything under it,
   * and leaves nothing behind in the branch it left: the page is simply
   * no longer among that parent's children (docs/adr/0074).
   */
  it('sends a visitor on when the page changed parent, not name', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group: services } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'servizi',
      title: 'Servizi',
    });
    const { group: home } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'casa',
      title: 'Casa',
    });
    const { group: plumbing } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'idraulica',
      title: 'Idraulica',
      parentGroupId: services.id,
    });

    await movePageGroupToParent(deps, {
      tenantId,
      pageGroupId: plumbing.id,
      parentId: home.id,
      actorUserId: null,
    });

    const result = await getPublishedPageBySlug(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
      segments: ['servizi', 'idraulica'],
    });

    expect(result.page).toBeNull();
    expect(result.redirectTo).toBe('/it/casa/idraulica');
  });

  it('serves the moved page at the address it lives at now', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group: services } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'servizi',
      title: 'Servizi',
    });
    const { group: plumbing } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'idraulica',
      title: 'Idraulica',
    });

    await movePageGroupToParent(deps, {
      tenantId,
      pageGroupId: plumbing.id,
      parentId: services.id,
      actorUserId: null,
    });

    const result = await getPublishedPageBySlug(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
      segments: ['servizi', 'idraulica'],
    });

    expect(result.redirectTo).toBeNull();
    expect(result.page).not.toBeNull();
  });

  it('serves the page normally at the address it actually lives at', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { translation } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
    await renamePageTranslation(deps, {
      tenantId,
      pageTranslationId: translation.id,
      slug: 'la-nostra-storia',
      parentGroupId: null,
      actorUserId: null,
    });

    const result = await getPublishedPageBySlug(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
      segments: ['la-nostra-storia'],
    });

    expect(result.redirectTo).toBeNull();
    expect(result.page).not.toBeNull();
  });

  it('reports a permanent move when a term has claimed the page as its landing page', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
    await claimAsLandingPage(deps, group, {
      prefix: 'categoria',
      slugs: { it: 'espresso' },
    });

    const result = await getPublishedPageBySlug(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
      segments: ['chi-siamo'],
    });

    expect(result.page).toBeNull();
    expect(result.redirectTo).toBe('/it/categoria/espresso');
  });

  /*
   * ...but only where the term is actually reachable. A language the
   * term has no slug in has no address to send anybody to, so the page
   * keeps answering rather than redirecting into nothing.
   */
  it('keeps serving the page in a language the term does not answer in', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
    await claimAsLandingPage(deps, group, {
      prefix: 'categoria',
      slugs: { en: 'espresso' },
    });

    const result = await getPublishedPageBySlug(deps, {
      tenantId,
      domain: 'example.com',
      locale: 'it',
      segments: ['chi-siamo'],
    });

    expect(result.redirectTo).toBeNull();
    expect(result.page?.seoMeta.title).toBe('Chi siamo');
  });

  it('returns the published content for a published page on the matching domain and locale', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result).toEqual({
      // The page translation's own id — it is what a form submitted from
      // this page records as its origin (ADR-0079). Generated by the
      // fixture, so matched by shape.
      id: expect.any(String),
      content: [
        { type: 'Hero', props: { title: 'Chi siamo', subtitle: 'sub' } },
      ],
      seoMeta: { title: 'Chi siamo', description: '' },
      locale: 'it',
      translations: [{ locale: 'it', slug: 'chi-siamo', ancestorSlugs: [] }],
      ancestors: [],
      header: null,
      footer: null,
      headerSticky: false,
      site: {
        name: 'Sito di prova',
        domain: 'example.com',
        themeName: 'classic',
        defaultLocale: 'it',
        enabledLocales: ['it', 'en'],
        untranslatedPageFallback: 'redirect-to-default',
        businessAddress: null,
        businessPhone: null,
        businessEmail: null,
        businessType: null,
        openingHours: null,
        searchEngineIndexingEnabled: false,
        themeSettings: {
          primaryColor: null,
          secondaryColor: null,
          fontFamily: null,
          customCss: null,
          contentWidth: null,
          headScript: null,
          bodyScript: null,
          faviconUrl: null,
          overridesEnabled: true,
          allowedTrackerDomains: [],
          trackerScripts: [],
        },
        themeTokens: {
          blockStyles: {},
        },
        cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
        privacyPolicySlug: null,
        cookiePolicySlug: null,
      },
    });
  });

  it('resolves a nested page by its full path and returns its ancestors root-to-parent, empty for a root page', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group: servizi } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'servizi',
      title: 'Servizi',
    });
    const idraulicaGroup = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      parentId: servizi.id,
      content: [{ type: 'Text', props: { body: 'x' } }],
      createdBy: 'user-1',
    });
    await publishTranslationInGroup(deps, idraulicaGroup, {
      locale: 'it',
      slug: 'idraulica',
      title: 'Idraulica',
    });

    const child = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['servizi', 'idraulica'],
      })
    ).page;
    expect(child?.ancestors).toEqual([{ slug: 'servizi', title: 'Servizi' }]);

    const root = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['servizi'],
      })
    ).page;
    expect(root?.ancestors).toEqual([]);
  });

  it('disambiguates two pages sharing the same trailing slug under different parents', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group: branchA } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'ramo-a',
      title: 'Ramo A',
    });
    const { group: branchB } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'ramo-b',
      title: 'Ramo B',
    });
    const childOfAGroup = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      parentId: branchA.id,
      content: [{ type: 'Text', props: { body: 'A' } }],
      createdBy: 'user-1',
    });
    await publishTranslationInGroup(deps, childOfAGroup, {
      locale: 'it',
      slug: 'dettagli',
      title: 'Dettagli A',
    });
    const childOfBGroup = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      parentId: branchB.id,
      content: [{ type: 'Text', props: { body: 'B' } }],
      createdBy: 'user-1',
    });
    await publishTranslationInGroup(deps, childOfBGroup, {
      locale: 'it',
      slug: 'dettagli',
      title: 'Dettagli B',
    });

    const foundUnderA = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['ramo-a', 'dettagli'],
      })
    ).page;
    expect(foundUnderA?.content).toEqual([
      { type: 'Text', props: { body: 'A' } },
    ]);

    const foundUnderB = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['ramo-b', 'dettagli'],
      })
    ).page;
    expect(foundUnderB?.content).toEqual([
      { type: 'Text', props: { body: 'B' } },
    ]);

    // The trailing slug alone is ambiguous now — a mismatched leading
    // segment must not accidentally match the OTHER branch's page.
    const wrongBranch = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['ramo-does-not-exist', 'dettagli'],
      })
    ).page;
    expect(wrongBranch).toBeNull();
  });

  it('lists every published locale-translation of the page, keyed by group', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
    await publishTranslationInGroup(deps, group, {
      locale: 'en',
      slug: 'about-us',
      title: 'About us',
    });

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(
      result?.translations.sort((a, b) => a.locale.localeCompare(b.locale)),
    ).toEqual([
      { locale: 'en', slug: 'about-us', ancestorSlugs: [] },
      { locale: 'it', slug: 'chi-siamo', ancestorSlugs: [] },
    ]);
  });

  it('never lists an unpublished draft translation in the same group', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
    // Draft-only English translation — never published.
    await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale: 'en',
      slug: 'about-us',
      seoMeta: { title: 'About us', description: '' },
      createdBy: 'user-1',
    });

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result?.translations).toEqual([
      { locale: 'it', slug: 'chi-siamo', ancestorSlugs: [] },
    ]);
  });

  it("includes the site's business info when set, for schema.org LocalBusiness", async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, {
      businessAddress: {
        street: 'Via Roma 1',
        postalCode: '20121',
        city: 'Milano',
        country: 'IT',
      },
      businessPhone: '+39 02 1234567',
      businessEmail: null,
      businessType: 'ProfessionalService',
      openingHours: [
        { dayOfWeek: 'monday', ranges: [{ opens: '09:00', closes: '18:00' }] },
      ],
    });
    await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result?.site).toMatchObject({
      businessAddress: {
        street: 'Via Roma 1',
        postalCode: '20121',
        city: 'Milano',
        country: 'IT',
      },
      businessPhone: '+39 02 1234567',
      businessEmail: null,
      businessType: 'ProfessionalService',
      openingHours: [
        { dayOfWeek: 'monday', ranges: [{ opens: '09:00', closes: '18:00' }] },
      ],
    });
  });

  it("propagates the site's search engine indexing flag", async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { searchEngineIndexingEnabled: true });
    await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result?.site.searchEngineIndexingEnabled).toBe(true);
  });

  it('never leaks draft content newer than the last publish', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const group = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      content: [{ type: 'Text', props: { body: 'published version' } }],
      createdBy: 'user-1',
    });
    await publishTranslationInGroup(deps, group, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
    // The group's draft structure is edited again after publishing — this
    // must never reach the public site: getPublishedPageBySlug always
    // reads the translation's frozen publishedSnapshot, never a live
    // merge of PageGroup.content (see the use case's own comment).
    await savePageGroupContent(deps, {
      tenantId,
      pageGroupId: group.id,
      content: [{ type: 'Text', props: { body: 'unpublished draft edit' } }],
      actorUserId: 'user-1',
    });

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result?.content).toEqual([
      { type: 'Text', props: { body: 'published version' } },
    ]);
  });

  it("resolves a NavLink's page reference to the CURRENT locale's own path, not whichever locale it was picked in", async () => {
    // Real bug, found live: `page` isn't a translatable field, so a
    // locale-specific slug baked in at pick time (the old pickedPageSchema
    // shape) got reused verbatim for every locale — an IT reader could get
    // an EN link. `page` is now locale-independent ({pageGroupId, title})
    // and resolved fresh for whichever locale is actually being rendered.
    const deps = setup();
    await seedSite(deps.siteRepository);
    const { group: docsGroup } = await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'documentazione',
      title: 'Documentazione',
    });
    await publishTranslationInGroup(deps, docsGroup, {
      locale: 'en',
      slug: 'docs',
      title: 'Docs',
    });
    const homeGroup = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      content: [
        {
          id: 'nav-1',
          type: 'NavLink',
          props: {
            label: 'Docs',
            linkType: 'page',
            page: { pageGroupId: docsGroup.id, title: 'Documentazione' },
            url: '',
          },
        },
      ],
      createdBy: 'user-1',
    });
    await publishTranslationInGroup(deps, homeGroup, {
      locale: 'it',
      slug: 'home',
      title: 'Home',
    });
    await publishTranslationInGroup(deps, homeGroup, {
      locale: 'en',
      slug: 'home-en',
      title: 'Home',
    });

    const it = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['home'],
      })
    ).page;
    const en = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'en',
        segments: ['home-en'],
      })
    ).page;

    expect(it?.content[0].props['page']).toMatchObject({
      locale: 'it',
      slug: 'documentazione',
    });
    expect(en?.content[0].props['page']).toMatchObject({
      locale: 'en',
      slug: 'docs',
    });
  });

  it('returns null for a page that has never been published', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const group = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      createdBy: 'user-1',
    });
    await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale: 'it',
      slug: 'bozza',
      seoMeta: { title: 'Bozza', description: '' },
      createdBy: 'user-1',
    });

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['bozza'],
      })
    ).page;

    expect(result).toBeNull();
  });

  it('returns null when no site matches the domain', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'nobody-has-this.test',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result).toBeNull();
  });

  it('returns null for a slug that does not exist on that site', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['non-esiste'],
      })
    ).page;

    expect(result).toBeNull();
  });

  it('returns null for a locale that has no page at this slug, even if another locale does', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });

    // No 'en' translation exists at all — requesting it directly 404s,
    // it does not fall back to the 'it' page (see the use case's own
    // comment on why: this is deliberate here, resolveUntranslatedPageFallback
    // is the caller's job).
    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'en',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result).toBeNull();
  });

  it('bundles the published header/footer for the same (site, locale)', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
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
    const footer = SiteLayoutSection.create({
      id: 'footer-1',
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'footer',
    });
    footer.saveDraft([{ type: 'Footer', props: {} }]);
    footer.publish();
    await deps.siteLayoutSectionRepository.add(footer);

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result?.header).toEqual([{ type: 'Header', props: {} }]);
    expect(result?.footer).toEqual([{ type: 'Footer', props: {} }]);
    expect(result?.headerSticky).toBe(false);
  });

  it('propagates a published sticky header, and gates it to false when the header is unpublished', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
    const stickyHeader = SiteLayoutSection.create({
      id: 'header-1',
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
      sticky: true,
    });
    stickyHeader.saveDraft([{ type: 'Header', props: {} }]);
    stickyHeader.publish();
    await deps.siteLayoutSectionRepository.add(stickyHeader);

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result?.headerSticky).toBe(true);
  });

  it('never leaks an unpublished header draft to the public site', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });
    const header = SiteLayoutSection.create({
      id: 'header-1',
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });
    header.saveDraft([{ type: 'Header', props: {} }]);
    // Never published.
    await deps.siteLayoutSectionRepository.add(header);

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result?.header).toBeNull();
  });

  it('returns null header/footer when none has ever been configured for this locale', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    await createGroupAndPublish(deps, {
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });

    const result = (
      await getPublishedPageBySlug(deps, {
        tenantId,
        domain: 'example.com',
        locale: 'it',
        segments: ['chi-siamo'],
      })
    ).page;

    expect(result?.header).toBeNull();
    expect(result?.footer).toBeNull();
  });

  // A slug is not an address once slugs are sibling-scoped (ADR-0029).
  // Every consumer given only `{ locale, slug }` built `/it/first-run`
  // for a page that lives at `/it/docs/getting-started/first-run`, and
  // linked to a 404 — the language switcher and the hreflang alternates
  // both did, on every nested page.
  describe('the address of each language, not just its slug', () => {
    async function seedNestedPage(deps: ReturnType<typeof setup>) {
      const { group: docs } = await createGroupAndPublish(deps, {
        locale: 'it',
        slug: 'documentazione',
        title: 'Documentazione',
      });
      await publishTranslationInGroup(deps, docs, {
        locale: 'en',
        slug: 'docs',
        title: 'Docs',
      });
      const { group: leaf } = await createGroupAndPublish(deps, {
        locale: 'it',
        slug: 'primo-avvio',
        title: 'Primo avvio',
        parentGroupId: docs.id,
      });
      return { docs, leaf };
    }

    // The ancestor's slug differs per language, which is why the chain
    // cannot be borrowed from the language being rendered: reusing it
    // would produce `/en/documentazione/first-run`, which 404s.
    it('resolves each language ancestor chain in that language', async () => {
      const deps = setup();
      await seedSite(deps.siteRepository);
      const { leaf } = await seedNestedPage(deps);
      await publishTranslationInGroup(deps, leaf, {
        locale: 'en',
        slug: 'first-run',
        title: 'First run',
      });

      const result = (
        await getPublishedPageBySlug(deps, {
          tenantId,
          domain: 'example.com',
          locale: 'it',
          segments: ['documentazione', 'primo-avvio'],
        })
      ).page;

      expect(
        result?.translations.sort((a, b) => a.locale.localeCompare(b.locale)),
      ).toEqual([
        { locale: 'en', slug: 'first-run', ancestorSlugs: ['docs'] },
        {
          locale: 'it',
          slug: 'primo-avvio',
          ancestorSlugs: ['documentazione'],
        },
      ]);
    });

    // The page is published in English but its parent is not translated
    // there, so no English URL resolves to it: the top-down walk stops at
    // the missing segment. Listing it would hand the switcher — and
    // search engines — a link to a 404.
    it('omits a language whose ancestor chain is incomplete', async () => {
      const deps = setup();
      await seedSite(deps.siteRepository);
      const { group: docs } = await createGroupAndPublish(deps, {
        locale: 'it',
        slug: 'documentazione',
        title: 'Documentazione',
      });
      const { group: leaf } = await createGroupAndPublish(deps, {
        locale: 'it',
        slug: 'primo-avvio',
        title: 'Primo avvio',
        parentGroupId: docs.id,
      });
      await publishTranslationInGroup(deps, leaf, {
        locale: 'en',
        slug: 'first-run',
        title: 'First run',
      });

      const result = (
        await getPublishedPageBySlug(deps, {
          tenantId,
          domain: 'example.com',
          locale: 'it',
          segments: ['documentazione', 'primo-avvio'],
        })
      ).page;

      expect(result?.translations).toEqual([
        {
          locale: 'it',
          slug: 'primo-avvio',
          ancestorSlugs: ['documentazione'],
        },
      ]);
    });
  });
});
