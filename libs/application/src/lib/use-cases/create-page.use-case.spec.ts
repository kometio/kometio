import { describe, expect, it } from 'vitest';
import {
  CollectionNotFoundError,
  LocaleNotEnabledError,
  PageGroupNotFoundError,
  PageSlugAlreadyExistsError,
  PageSlugCollidesWithTermError,
  SiteNotFoundError,
  Taxonomy,
} from '@kometio/domain-core';
import { createPage } from './create-page.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { createPageGroup } from './create-page-group.use-case';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemoryTaxonomyRepository,
  InMemorySiteRepository,
  InMemoryCollectionRepository,
  buildSite,
  buildCollection,
} from '@kometio/testing';

const tenantId = 'tenant-1';
const siteId = 'site-1';

function setup() {
  const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
  const pageTranslationRepository = new InMemoryPageTranslationRepository(
    new InMemoryPageTranslationVersionRepository(),
  );
  return {
    pageGroupRepository: new InMemoryPageGroupRepository(
      pageGroupVersionRepository,
      pageTranslationRepository,
    ),
    pageGroupVersionRepository,
    pageTranslationRepository,
    taxonomyRepository: new InMemoryTaxonomyRepository(),
    // The site these pages live on, in every language they are written in.
    siteRepository: new InMemorySiteRepository(
      buildSite({ enabledLocales: ['it', 'en'] }),
    ),
    collectionRepository: new InMemoryCollectionRepository(
      buildCollection({ id: 'collection-news' }),
    ),
    reusableSectionRepository: new InMemoryReusableSectionRepository(),
  };
}

type Deps = ReturnType<typeof setup>;

function create(
  deps: Deps,
  overrides: Partial<Parameters<typeof createPage>[1]> = {},
) {
  return createPage(deps, {
    tenantId,
    siteId,
    locale: 'it',
    slug: 'chi-siamo',
    seoMeta: { title: 'Chi siamo', description: '' },
    createdBy: 'user-1',
    ...overrides,
  });
}

/** Every group of the site at the root, with how many languages each has. */
async function rootPages(deps: Deps) {
  const groups = await deps.pageGroupRepository.listSiblings(
    tenantId,
    siteId,
    null,
  );
  return Promise.all(
    groups.map(async (group) => ({
      id: group.id,
      languages: (
        await deps.pageTranslationRepository.listByGroup(tenantId, group.id)
      ).length,
    })),
  );
}

describe('createPage', () => {
  it('creates the page, its first version and its first language together', async () => {
    const deps = setup();

    const { group, translation } = await create(deps, {
      collectionId: 'collection-news',
      content: [{ id: 'hero-1', type: 'Hero', props: { title: 'Ciao' } }],
    });

    expect(group.collectionId).toBe('collection-news');
    expect(translation.pageGroupId).toBe(group.id);
    expect(translation).toMatchObject({
      locale: 'it',
      slug: 'chi-siamo',
      status: 'draft',
    });
    expect(translation.seoMeta.title).toBe('Chi siamo');
    const versions = await deps.pageGroupVersionRepository.listByGroup(
      tenantId,
      group.id,
    );
    expect(versions.map((version) => version.content)).toEqual([group.content]);
    expect(await rootPages(deps)).toEqual([{ id: group.id, languages: 1 }]);
  });

  /*
   * The bug this exists for: the editor created the group, then its
   * language, and a language refused for its address left a page with no
   * language — listed with no title, crashing the editor that opened it.
   */
  it('writes nothing when the address is already taken', async () => {
    const deps = setup();
    const { group: existing } = await create(deps);

    await expect(create(deps, { slug: 'chi-siamo' })).rejects.toThrow(
      PageSlugAlreadyExistsError,
    );

    expect(await rootPages(deps)).toEqual([{ id: existing.id, languages: 1 }]);
  });

  it('writes nothing when a dimension already answers at that root address', async () => {
    const deps = setup();
    await deps.taxonomyRepository.addTaxonomy(
      Taxonomy.create({
        id: 'taxonomy-1',
        tenantId,
        siteId,
        name: { it: 'Categorie' },
        prefix: 'categorie',
      }),
    );

    await expect(create(deps, { slug: 'categorie' })).rejects.toThrow(
      PageSlugCollidesWithTermError,
    );
    expect(await rootPages(deps)).toEqual([]);
  });

  it('lets a nested page take an address its parent level already uses', async () => {
    const deps = setup();
    const { group: parent } = await create(deps, { slug: 'servizi' });

    const { translation } = await create(deps, {
      parentId: parent.id,
      slug: 'servizi',
    });

    expect(translation.slug).toBe('servizi');
  });

  it('appends the page after the siblings already there', async () => {
    const deps = setup();
    const first = await createPageGroup(deps, {
      tenantId,
      siteId,
      createdBy: null,
    });
    await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: first.id,
      locale: 'it',
      slug: 'prima',
      seoMeta: { title: 'Prima', description: '' },
      createdBy: null,
    });

    const { group } = await create(deps, { slug: 'seconda' });

    expect(group.order).toBe(first.order + 1);
  });

  it('refuses content and a template together rather than choosing one', async () => {
    const deps = setup();

    await expect(
      create(deps, {
        templateId: 'template-1',
        content: [{ id: 'hero-1', type: 'Hero', props: {} }],
      }),
    ).rejects.toThrow('not both');
    expect(await rootPages(deps)).toEqual([]);
  });
});

/*
 * Where a page goes, and in what language, used to be taken as sent: the
 * foreign key only checks that a row exists, and row-level security only
 * that it is this tenant's. A parent or a collection of another site was
 * accepted, an id that named nothing reached the insert as a 500, and any
 * string was a language.
 */
describe('createPage — where it goes and in what language', () => {
  async function anotherSite(deps: Deps) {
    await deps.siteRepository.add(
      buildSite({ id: 'site-2', domain: 'altro.example' }),
    );
    await deps.collectionRepository.add(
      buildCollection({ id: 'collection-altrui', siteId: 'site-2' }),
    );
    return (await create(deps, { siteId: 'site-2', slug: 'altrove' })).group;
  }

  it('refuses a parent from another site', async () => {
    const deps = setup();
    const foreign = await anotherSite(deps);

    await expect(create(deps, { parentId: foreign.id })).rejects.toThrow(
      PageGroupNotFoundError,
    );
    expect(await rootPages(deps)).toEqual([]);
  });

  it('refuses a parent that does not exist, as not found rather than a server error', async () => {
    const deps = setup();

    await expect(create(deps, { parentId: 'nessuna' })).rejects.toThrow(
      PageGroupNotFoundError,
    );
  });

  it('refuses a collection from another site, or none at all', async () => {
    const deps = setup();
    await anotherSite(deps);

    await expect(
      create(deps, { collectionId: 'collection-altrui' }),
    ).rejects.toThrow(CollectionNotFoundError);
    await expect(create(deps, { collectionId: 'nessuna' })).rejects.toThrow(
      CollectionNotFoundError,
    );
    expect(await rootPages(deps)).toEqual([]);
  });

  it('refuses a site that does not exist', async () => {
    const deps = setup();

    await expect(create(deps, { siteId: 'site-nessuno' })).rejects.toThrow(
      SiteNotFoundError,
    );
  });

  it.each(['fr', 'EN', 'en ', 'x'.repeat(40)])(
    'refuses %j, a language the site does not offer, and writes nothing',
    async (locale) => {
      const deps = setup();

      await expect(create(deps, { locale })).rejects.toThrow(
        LocaleNotEnabledError,
      );
      expect(await rootPages(deps)).toEqual([]);
    },
  );

  it('refuses the same when a language is added to an existing page', async () => {
    const deps = setup();
    const { group } = await create(deps);

    await expect(
      createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: group.id,
        locale: 'fr',
        slug: 'qui-sommes-nous',
        seoMeta: { title: 'Qui', description: '' },
        createdBy: 'user-1',
      }),
    ).rejects.toThrow(LocaleNotEnabledError);
  });

  it('refuses the same for a structure created without a language', async () => {
    const deps = setup();
    const foreign = await anotherSite(deps);

    await expect(
      createPageGroup(deps, {
        tenantId,
        siteId,
        parentId: foreign.id,
        createdBy: 'user-1',
      }),
    ).rejects.toThrow(PageGroupNotFoundError);
  });
});
