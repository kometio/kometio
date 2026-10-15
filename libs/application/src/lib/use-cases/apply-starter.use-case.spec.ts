import { beforeEach, describe, expect, it } from 'vitest';
import {
  InvalidThemeNameError,
  SiteIsNotBlankError,
  SiteNotFoundError,
  type Site,
} from '@kometio/domain-core';
import {
  InMemoryCollectionRepository,
  InMemoryFormRepository,
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemorySearchPort,
  InMemorySiteLayoutSectionRepository,
  InMemorySiteLayoutSectionVersionRepository,
  InMemorySiteRepository,
  InMemoryTaxonomyRepository,
  InMemoryThemeCatalog,
  buildPageGroup,
  buildPageTranslation,
  buildSite,
} from '@kometio/testing';
import { STARTER_IDS, type PageContent } from '@kometio/shared-types';
import { applyStarter, getStarterOffer } from './apply-starter.use-case';

const TENANT = 'tenant-1';
const SITE = 'site-1';
const USER = 'user-1';
const HOME_GROUP = 'home-group';

/** What the wizard writes: one Hero holding the site's name, published. */
function wizardHome(siteName: string): PageContent {
  return [
    { id: 'hero-1', type: 'Hero', props: { title: siteName, subtitle: '' } },
  ];
}

async function arrange(
  overrides: {
    siteName?: string;
    locale?: string;
    themeName?: string;
    themes?: string[];
  } = {},
) {
  const siteName = overrides.siteName ?? 'Casa Azzurra';
  const locale = overrides.locale ?? 'it-IT';
  const pageTranslationRepository = new InMemoryPageTranslationRepository(
    new InMemoryPageTranslationVersionRepository(),
  );
  const pageGroupRepository = new InMemoryPageGroupRepository(
    new InMemoryPageGroupVersionRepository(),
    pageTranslationRepository,
  );
  const siteRepository = new InMemorySiteRepository();
  const site = buildSite({
    id: SITE,
    tenantId: TENANT,
    name: siteName,
    defaultLocale: locale,
    enabledLocales: [locale],
    themeName: overrides.themeName ?? 'classic',
  });
  await siteRepository.add(site);

  const content = wizardHome(siteName);
  const group = buildPageGroup({
    id: HOME_GROUP,
    tenantId: TENANT,
    siteId: SITE,
    content,
  });
  const translation = buildPageTranslation({
    id: 'home-translation',
    tenantId: TENANT,
    siteId: SITE,
    pageGroupId: HOME_GROUP,
    locale,
    slug: 'home',
    seoMeta: { title: siteName, description: '' },
  });
  translation.publish(content, { by: USER });
  await pageGroupRepository.addWithTranslation(
    group,
    {
      id: 'v1',
      tenantId: TENANT,
      pageGroupId: HOME_GROUP,
      content,
      createdBy: USER,
      createdAt: new Date(),
    },
    translation,
  );

  const deps = {
    siteRepository,
    pageGroupRepository,
    pageTranslationRepository,
    collectionRepository: new InMemoryCollectionRepository(),
    formRepository: new InMemoryFormRepository(),
    taxonomyRepository: new InMemoryTaxonomyRepository(),
    siteLayoutSectionRepository: new InMemorySiteLayoutSectionRepository(),
    siteLayoutSectionVersionRepository:
      new InMemorySiteLayoutSectionVersionRepository(),
    reusableSectionRepository: new InMemoryReusableSectionRepository(),
    searchPort: new InMemorySearchPort(),
    themeCatalog: new InMemoryThemeCatalog(
      (overrides.themes ?? ['classic', 'docs-showcase']).map((name) => ({
        name,
        uploaded: false,
      })),
    ),
  };
  return { deps, site, group, translation };
}

const apply = (
  deps: Awaited<ReturnType<typeof arrange>>['deps'],
  starterId: (typeof STARTER_IDS)[number],
) =>
  applyStarter(deps, {
    tenantId: TENANT,
    siteId: SITE,
    starterId,
    actorUserId: USER,
  });

async function everyPage(deps: Awaited<ReturnType<typeof arrange>>['deps']) {
  const groups = await deps.pageGroupRepository.listBySite(TENANT, SITE, {
    page: 1,
    pageSize: 100,
  });
  return Promise.all(
    groups.items.map(async (summary) => {
      const group = await deps.pageGroupRepository.findById(TENANT, summary.id);
      const translations = await deps.pageTranslationRepository.listByGroup(
        TENANT,
        summary.id,
      );
      if (!group) throw new Error(`No group ${summary.id}`);
      return { group, translations };
    }),
  );
}

describe('applyStarter', () => {
  let world: Awaited<ReturnType<typeof arrange>>;

  beforeEach(async () => {
    world = await arrange();
  });

  it.each(STARTER_IDS)(
    'makes the %s starter: every page published, in the site’s own language',
    async (starterId) => {
      const result = await apply(world.deps, starterId);
      const pages = await everyPage(world.deps);

      expect(result.starterId).toBe(starterId);
      expect(result.pages).toBe(pages.length);
      expect(pages.length).toBeGreaterThan(1);
      for (const { translations } of pages) {
        expect(translations).toHaveLength(1);
        expect(translations[0]?.locale).toBe('it-IT');
        expect(translations[0]?.status).toBe('published');
        expect(translations[0]?.publishedSnapshot).not.toBeNull();
      }
    },
  );

  it('puts the starter’s home on the page the wizard made, at the address it already had', async () => {
    await apply(world.deps, 'studio');

    const home = await world.deps.pageGroupRepository.findById(
      TENANT,
      HOME_GROUP,
    );
    const translation = await world.deps.pageTranslationRepository.findById(
      TENANT,
      'home-translation',
    );

    expect(home?.content.map((block) => block.type)).toContain('Hero');
    expect(home?.content.length).toBeGreaterThan(1);
    expect(translation?.slug).toBe('home');
    // The title stays the site's name: it is what the browser tab says.
    expect(translation?.seoMeta.title).toBe('Casa Azzurra');
    expect(translation?.seoMeta.description).not.toBe('');
    expect(translation?.publishedSnapshot).toEqual(home?.content);
  });

  it('points every link at a page of the site and every form block at its form', async () => {
    await apply(world.deps, 'studio');
    const pages = await everyPage(world.deps);
    const groupIds = new Set(pages.map(({ group }) => group.id));
    const forms = await world.deps.formRepository.listBySite(TENANT, SITE, {
      page: 1,
      pageSize: 10,
    });
    const formIds = new Set(forms.items.map((form) => form.id));

    const found: { pages: string[]; forms: string[] } = {
      pages: [],
      forms: [],
    };
    const walk = (blocks: PageContent) => {
      for (const block of blocks) {
        const page: unknown = block.props['page'];
        if (page && typeof page === 'object' && 'pageGroupId' in page) {
          found.pages.push(String(page.pageGroupId));
        }
        const form: unknown = block.props['form'];
        if (form && typeof form === 'object' && 'formId' in form) {
          found.forms.push(String(form.formId));
        }
        walk(block.children ?? []);
      }
    };
    for (const { group } of pages) walk(group.content);

    expect(found.pages.length).toBeGreaterThan(0);
    expect(found.forms.length).toBeGreaterThan(0);
    expect(found.pages.every((id) => groupIds.has(id))).toBe(true);
    expect(found.forms.every((id) => formIds.has(id))).toBe(true);
    expect(
      JSON.stringify(pages.map(({ group }) => group.content)),
    ).not.toContain('starter:');
  });

  it('makes a contact form with its fields and nobody to notify', async () => {
    await apply(world.deps, 'studio');

    const forms = await world.deps.formRepository.listBySite(TENANT, SITE, {
      page: 1,
      pageSize: 10,
    });

    expect(forms.total).toBe(1);
    expect(forms.items[0]?.fields.map((field) => field.type)).toEqual([
      'text',
      'email',
      'textarea',
    ]);
    expect(forms.items[0]?.notificationEmails).toEqual([]);
  });

  it('publishes a header and a footer in the site’s language', async () => {
    await apply(world.deps, 'studio');

    for (const kind of ['header', 'footer'] as const) {
      const section =
        await world.deps.siteLayoutSectionRepository.findBySiteLocaleKind(
          TENANT,
          SITE,
          'it-IT',
          kind,
        );
      expect(section?.status).toBe('published');
      expect(section?.publishedContent?.length).toBeGreaterThan(0);
    }
  });

  it('files the blog’s articles in their section and their category', async () => {
    await apply(world.deps, 'blog');

    const collections = await world.deps.collectionRepository.listBySite(
      TENANT,
      SITE,
    );
    const taxonomies = await world.deps.taxonomyRepository.listTaxonomiesBySite(
      TENANT,
      SITE,
    );
    const pages = await everyPage(world.deps);
    const articles = pages.filter(
      ({ group }) => group.collectionId === collections[0]?.id,
    );

    expect(collections.map((collection) => collection.name)).toEqual([
      'Articoli',
    ]);
    expect(taxonomies.map((taxonomy) => taxonomy.name)).toEqual([
      { 'it-IT': 'Categorie' },
    ]);
    expect(articles).toHaveLength(3);
    for (const { group } of articles) {
      const terms = await world.deps.taxonomyRepository.listTermIdsForPageGroup(
        TENANT,
        group.id,
      );
      expect(terms).toHaveLength(1);
    }
  });

  it('nests the portfolio’s projects under their page', async () => {
    await apply(world.deps, 'portfolio');
    const pages = await everyPage(world.deps);
    const projectsPage = pages.find(({ translations }) =>
      translations.some((translation) => translation.slug === 'progetti'),
    );

    const children = pages.filter(
      ({ group }) => group.parentId === projectsPage?.group.id,
    );

    expect(children).toHaveLength(3);
  });

  it('writes it in English for an English site, and for a language it has no text in', async () => {
    const english = await arrange({ locale: 'en-GB' });
    const french = await arrange({ locale: 'fr-FR' });

    const inEnglish = await apply(english.deps, 'studio');
    const inFrench = await apply(french.deps, 'studio');

    expect(inEnglish).toMatchObject({ language: 'en', fallback: false });
    expect(inFrench).toMatchObject({ language: 'en', fallback: true });
    const [services] = (await everyPage(french.deps)).filter(
      ({ translations }) =>
        translations.some((translation) => translation.slug === 'services'),
    );
    // Made in the language of the site, whatever the words are in.
    expect(services?.translations[0]?.locale).toBe('fr-FR');
  });

  it('writes it in Italian for an Italian site', async () => {
    const result = await apply(world.deps, 'studio');
    const pages = await everyPage(world.deps);

    expect(result).toMatchObject({ language: 'it', fallback: false });
    expect(
      pages.some(({ translations }) =>
        translations.some((translation) => translation.slug === 'servizi'),
      ),
    ).toBe(true);
  });

  it('takes the starter’s theme when the site is on another one', async () => {
    const onOther = await arrange({ themeName: 'docs-showcase' });

    await apply(onOther.deps, 'studio');

    const site = await onOther.deps.siteRepository.findById(TENANT, SITE);
    expect(site?.themeName).toBe('classic');
  });

  describe('refuses a site that is not new', () => {
    it('whose home page has been written', async () => {
      world.group.saveContent(
        [{ id: 'x', type: 'Text', props: { body: '<p>Mine</p>' } }],
        { by: USER },
      );
      await world.deps.pageGroupRepository.saveContent(world.group, {
        id: 'v2',
        tenantId: TENANT,
        pageGroupId: HOME_GROUP,
        content: world.group.content,
        createdBy: USER,
        createdAt: new Date(),
      });

      await expect(apply(world.deps, 'studio')).rejects.toBeInstanceOf(
        SiteIsNotBlankError,
      );
    });

    it('that has another page', async () => {
      const other = buildPageGroup({
        id: 'other',
        tenantId: TENANT,
        siteId: SITE,
      });
      await world.deps.pageGroupRepository.addWithVersion(other, {
        id: 'v-other',
        tenantId: TENANT,
        pageGroupId: 'other',
        content: [],
        createdBy: USER,
        createdAt: new Date(),
      });

      await expect(apply(world.deps, 'studio')).rejects.toBeInstanceOf(
        SiteIsNotBlankError,
      );
    });

    it('that already has a starter on it', async () => {
      await apply(world.deps, 'blog');

      await expect(apply(world.deps, 'studio')).rejects.toBeInstanceOf(
        SiteIsNotBlankError,
      );
    });

    it('and changes nothing when it does', async () => {
      await apply(world.deps, 'blog');
      const before = (await everyPage(world.deps)).length;

      await apply(world.deps, 'studio').catch(() => undefined);

      expect((await everyPage(world.deps)).length).toBe(before);
    });
  });

  it('says there is no such site', async () => {
    await expect(
      applyStarter(world.deps, {
        tenantId: TENANT,
        siteId: 'nowhere',
        starterId: 'studio',
        actorUserId: USER,
      }),
    ).rejects.toBeInstanceOf(SiteNotFoundError);
  });

  describe('when something fails half way', () => {
    async function failingAt(
      stage: 'page' | 'layout' | 'theme',
    ): Promise<Awaited<ReturnType<typeof arrange>>> {
      const world = await arrange({
        themeName: stage === 'theme' ? 'docs-showcase' : 'classic',
      });
      if (stage === 'page') {
        // The third page made is the one that fails: the others are done.
        let made = 0;
        const original = world.deps.pageGroupRepository.addWithTranslation.bind(
          world.deps.pageGroupRepository,
        );
        world.deps.pageGroupRepository.addWithTranslation = async (...args) => {
          made += 1;
          if (made === 3) throw new Error('database went away');
          return original(...args);
        };
      }
      if (stage === 'layout') {
        const original = world.deps.siteLayoutSectionRepository.save.bind(
          world.deps.siteLayoutSectionRepository,
        );
        let saves = 0;
        world.deps.siteLayoutSectionRepository.save = async (section) => {
          saves += 1;
          // The header saves; the footer is where it goes wrong.
          if (saves === 2) throw new Error('database went away');
          return original(section);
        };
      }
      return world;
    }

    it.each(['page', 'layout'] as const)(
      'leaves the site as new as it was, so it can be tried again (at the %s)',
      async (stage) => {
        const failing = await failingAt(stage);
        const homeBefore = JSON.stringify(
          (await failing.deps.pageGroupRepository.findById(TENANT, HOME_GROUP))
            ?.content,
        );

        await expect(apply(failing.deps, 'blog')).rejects.toThrow(
          'database went away',
        );

        const pages = await everyPage(failing.deps);
        expect(pages).toHaveLength(1);
        expect(
          JSON.stringify(
            (
              await failing.deps.pageGroupRepository.findById(
                TENANT,
                HOME_GROUP,
              )
            )?.content,
          ),
        ).toBe(homeBefore);
        expect(
          await failing.deps.collectionRepository.listBySite(TENANT, SITE),
        ).toEqual([]);
        expect(
          await failing.deps.taxonomyRepository.listTaxonomiesBySite(
            TENANT,
            SITE,
          ),
        ).toEqual([]);
        const offer = await getStarterOffer(failing.deps, {
          tenantId: TENANT,
          siteId: SITE,
        });
        expect(offer.available).toBe(true);
      },
    );

    it('puts the theme back when it was changed', async () => {
      const failing = await failingAt('theme');
      // The home page is the first thing written after the theme.
      failing.deps.pageGroupRepository.saveContent = async () => {
        throw new Error('database went away');
      };

      await expect(apply(failing.deps, 'studio')).rejects.toThrow(
        'database went away',
      );

      const site: Site | null = await failing.deps.siteRepository.findById(
        TENANT,
        SITE,
      );
      expect(site?.themeName).toBe('docs-showcase');
    });
  });
});

describe('getStarterOffer', () => {
  it('offers the three starters, in the site’s language, to a new site', async () => {
    const { deps } = await arrange();

    const offer = await getStarterOffer(deps, {
      tenantId: TENANT,
      siteId: SITE,
    });

    expect(offer).toEqual({
      available: true,
      language: 'it',
      fallback: false,
      starters: ['studio', 'portfolio', 'blog'],
    });
  });

  it('says so, and not that anything is wrong, for a language it has no text in', async () => {
    const { deps } = await arrange({ locale: 'ja-JP' });

    const offer = await getStarterOffer(deps, {
      tenantId: TENANT,
      siteId: SITE,
    });

    expect(offer).toMatchObject({
      available: true,
      language: 'en',
      fallback: true,
    });
  });

  it('is not available once the site has something of its own', async () => {
    const { deps } = await arrange();
    await apply(deps, 'portfolio');

    const offer = await getStarterOffer(deps, {
      tenantId: TENANT,
      siteId: SITE,
    });

    expect(offer.available).toBe(false);
  });

  it('is not available when the home page was changed', async () => {
    const { deps, group } = await arrange();
    group.saveContent(
      [{ id: 'hero-1', type: 'Hero', props: { title: 'Mine', subtitle: '' } }],
      { by: USER },
    );
    await deps.pageGroupRepository.saveContent(group, {
      id: 'v2',
      tenantId: TENANT,
      pageGroupId: HOME_GROUP,
      content: group.content,
      createdBy: USER,
      createdAt: new Date(),
    });

    const offer = await getStarterOffer(deps, {
      tenantId: TENANT,
      siteId: SITE,
    });

    expect(offer.available).toBe(false);
  });
});

describe('an error of the theme catalog', () => {
  it('is the error of the starter when its theme is not installed', async () => {
    const world = await arrange({
      themeName: 'docs-showcase',
      themes: ['docs-showcase'],
    });

    await expect(apply(world.deps, 'studio')).rejects.toBeInstanceOf(
      InvalidThemeNameError,
    );
  });
});
