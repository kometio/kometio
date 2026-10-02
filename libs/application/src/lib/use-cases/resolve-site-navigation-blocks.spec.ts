import { describe, expect, it } from 'vitest';
import type { PageContent, SiteMapNode } from '@kometio/shared-types';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { resolveSiteNavigationBlocks } from './resolve-site-navigation-blocks';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryTaxonomyRepository,
  InMemorySiteRepository,
  InMemoryCollectionRepository,
  buildSite,
  buildCollection,
} from '@kometio/testing';

const tenantId = 'tenant-1';
const siteId = 'site-1';
const locale = 'it';

function setup() {
  return {
    pageGroupRepository: new InMemoryPageGroupRepository(
      new InMemoryPageGroupVersionRepository(),
    ),
    pageTranslationRepository: new InMemoryPageTranslationRepository(
      new InMemoryPageTranslationVersionRepository(),
    ),
    // Only because creating a translation checks its address against the
    // terms'; nothing here reads a term.
    taxonomyRepository: new InMemoryTaxonomyRepository(),
    // The site these pages live on, in every language they are written in.
    siteRepository: new InMemorySiteRepository(
      buildSite({ enabledLocales: ['it', 'en'] }),
    ),
    collectionRepository: new InMemoryCollectionRepository(
      buildCollection({ id: 'news' }),
    ),
  };
}

/** A published page, created in the order the tree will list it. */
async function seedPage(
  deps: ReturnType<typeof setup>,
  slug: string,
  options: { parentId?: string | null; collectionId?: string | null } = {},
) {
  const group = await createPageGroup(deps, {
    tenantId,
    siteId,
    parentId: options.parentId ?? null,
    collectionId: options.collectionId ?? null,
    createdBy: null,
  });
  const translation = await createPageGroupTranslation(deps, {
    tenantId,
    pageGroupId: group.id,
    locale,
    slug,
    seoMeta: { title: slug, description: '' },
    createdBy: null,
  });
  const stored = await deps.pageTranslationRepository.findById(
    tenantId,
    translation.id,
  );
  if (!stored) throw new Error('the translation just created is missing');
  stored.publish([], { by: null, now: new Date() });
  await deps.pageTranslationRepository.publish(stored);
  return group.id;
}

async function seedManual(deps: ReturnType<typeof setup>) {
  const manual = await seedPage(deps, 'manuale');
  const install = await seedPage(deps, 'installare', { parentId: manual });
  const configure = await seedPage(deps, 'configurare', { parentId: manual });
  const publish = await seedPage(deps, 'pubblicare', { parentId: manual });
  return { manual, install, configure, publish };
}

const titles = (items: unknown) =>
  (items as { title: string }[]).map((item) => item.title);

describe('resolveSiteNavigationBlocks', () => {
  it("lists the current page's children, in the order the tree gives them", async () => {
    const deps = setup();
    const { manual } = await seedManual(deps);
    const page: PageContent = [
      {
        id: 's',
        type: 'SubPages',
        props: { parent: null, limit: 0, items: [] },
      },
    ];

    const [resolved] = await resolveSiteNavigationBlocks(
      deps,
      tenantId,
      siteId,
      locale,
      manual,
      [page],
    );

    expect(titles(resolved[0].props['items'])).toEqual([
      'installare',
      'configurare',
      'pubblicare',
    ]);
    expect((resolved[0].props['items'] as { path: string }[])[0].path).toBe(
      '/it/manuale/installare',
    );
  });

  it('lists the children of a page chosen by hand, capped at the limit', async () => {
    const deps = setup();
    const { manual } = await seedManual(deps);
    const elsewhere = await seedPage(deps, 'altrove');
    const page: PageContent = [
      {
        id: 's',
        type: 'SubPages',
        props: {
          parent: { pageGroupId: manual, title: 'manuale' },
          limit: 2,
          items: [],
        },
      },
    ];

    const [resolved] = await resolveSiteNavigationBlocks(
      deps,
      tenantId,
      siteId,
      locale,
      elsewhere,
      [page],
    );

    expect(titles(resolved[0].props['items'])).toEqual([
      'installare',
      'configurare',
    ]);
  });

  it('gives a page the sibling before and after it, and nothing past either end', async () => {
    const deps = setup();
    const { install, configure, publish } = await seedManual(deps);
    const nav = (): PageContent => [
      { id: 'n', type: 'SiblingPages', props: { previous: null, next: null } },
    ];

    const [middle] = await resolveSiteNavigationBlocks(
      deps,
      tenantId,
      siteId,
      locale,
      configure,
      [nav()],
    );
    const [first] = await resolveSiteNavigationBlocks(
      deps,
      tenantId,
      siteId,
      locale,
      install,
      [nav()],
    );
    const [last] = await resolveSiteNavigationBlocks(
      deps,
      tenantId,
      siteId,
      locale,
      publish,
      [nav()],
    );

    expect((middle[0].props['previous'] as { title: string }).title).toBe(
      'installare',
    );
    expect((middle[0].props['next'] as { title: string }).title).toBe(
      'pubblicare',
    );
    expect(first[0].props['previous']).toBeNull();
    expect(last[0].props['next']).toBeNull();
  });

  it('draws the tree to the depth asked for, leaving collection pages out of it', async () => {
    const deps = setup();
    const { manual, install } = await seedManual(deps);
    await seedPage(deps, 'dettaglio', { parentId: install });
    await seedPage(deps, 'notizia-1', {
      parentId: manual,
      collectionId: 'news',
    });
    const page: PageContent = [
      { id: 'm', type: 'SiteMap', props: { depth: 2, tree: [] } },
    ];

    const [resolved] = await resolveSiteNavigationBlocks(
      deps,
      tenantId,
      siteId,
      locale,
      null,
      [page],
    );

    const tree = resolved[0].props['tree'] as SiteMapNode[];
    expect(tree.map((node) => node.title)).toEqual(['manuale']);
    expect(tree[0].children.map((node) => node.title)).toEqual([
      'installare',
      'configurare',
      'pubblicare',
    ]);
    // Depth 2: the third level is not drawn.
    expect(tree[0].children[0].children).toEqual([]);
  });

  it('does not read the site at all when the page has none of these blocks', async () => {
    const deps = setup();
    let asked = false;
    deps.pageGroupRepository.listBySite = async () => {
      asked = true;
      return { items: [], total: 0 };
    };
    const page: PageContent = [
      { id: 't', type: 'Text', props: { body: 'ciao' } },
    ];

    const [resolved] = await resolveSiteNavigationBlocks(
      deps,
      tenantId,
      siteId,
      locale,
      null,
      [page],
    );

    expect(resolved).toBe(page);
    expect(asked).toBe(false);
  });
});
