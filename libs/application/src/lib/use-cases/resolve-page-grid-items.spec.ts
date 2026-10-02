import { describe, expect, it } from 'vitest';
import { PageGroup, PageTranslation } from '@kometio/domain-core';
import type { Block, PageGridItem } from '@kometio/shared-types';
import {
  InMemoryPageGroupRepository,
  InMemoryPageTranslationRepository,
  InMemoryTaxonomyRepository,
} from '@kometio/testing';
import { resolvePageGridItems } from './resolve-page-grid-items';

const tenantId = 'tenant-1';
const siteId = 'site-1';
const termId = 'term-1';

function setup() {
  return {
    taxonomyRepository: new InMemoryTaxonomyRepository(),
    pageGroupRepository: new InMemoryPageGroupRepository(),
    pageTranslationRepository: new InMemoryPageTranslationRepository(),
  };
}

async function seedArticle(
  deps: ReturnType<typeof setup>,
  input: {
    id: string;
    title: string;
    publishedAt: Date | null;
    description?: string;
    image?: string;
  },
) {
  const group = PageGroup.create({ id: input.id, tenantId, siteId });
  await deps.pageGroupRepository.add(group);
  const translation = PageTranslation.create({
    id: `${input.id}-it`,
    tenantId,
    siteId,
    pageGroupId: group.id,
    locale: 'it',
    slug: input.id,
    seoMeta: {
      title: input.title,
      description: input.description ?? '',
      ...(input.image ? { ogTags: { image: input.image } } : {}),
    },
  });
  if (input.publishedAt) {
    translation.publish([], { by: null, now: input.publishedAt });
  } else {
    // Published, but with no date on record — a page from before the
    // column existed.
    translation.publish([], { by: null });
    const props = translation.toProps();
    await deps.pageTranslationRepository.add(
      PageTranslation.fromProps({ ...props, publishedAt: null }),
      null,
    );
    await deps.taxonomyRepository.setTermsForPageGroup(tenantId, group.id, [
      termId,
    ]);
    return;
  }
  await deps.pageTranslationRepository.add(translation, null);
  await deps.taxonomyRepository.setTermsForPageGroup(tenantId, group.id, [
    termId,
  ]);
}

function grid(order: 'title' | 'newest'): Block {
  return {
    id: 'grid-1',
    type: 'PageGrid',
    props: { termId, order, items: [] },
  };
}

async function itemsFor(
  deps: ReturnType<typeof setup>,
  order: 'title' | 'newest',
): Promise<PageGridItem[]> {
  const [content] = await resolvePageGridItems(deps, tenantId, siteId, 'it', [
    [grid(order)],
  ]);
  return content[0].props['items'] as PageGridItem[];
}

describe('resolvePageGridItems', () => {
  it('carries what a card needs: the date, the summary and the picture', async () => {
    const deps = setup();
    await seedArticle(deps, {
      id: 'one',
      title: 'One',
      publishedAt: new Date('2026-03-01T00:00:00Z'),
      description: 'Che cosa è successo',
      image: 'https://example.test/one.jpg',
    });

    const [item] = await itemsFor(deps, 'title');

    expect(item.publishedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(item.excerpt).toBe('Che cosa è successo');
    expect(item.image).toBe('https://example.test/one.jpg');
  });

  it('orders alphabetically by default, so no existing list is quietly reordered', async () => {
    const deps = setup();
    await seedArticle(deps, {
      id: 'zeta',
      title: 'Zeta',
      publishedAt: new Date('2026-06-01T00:00:00Z'),
    });
    await seedArticle(deps, {
      id: 'alfa',
      title: 'Alfa',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect((await itemsFor(deps, 'title')).map((one) => one.title)).toEqual([
      'Alfa',
      'Zeta',
    ]);
  });

  it('orders newest first when asked, which is what an archive is', async () => {
    const deps = setup();
    await seedArticle(deps, {
      id: 'zeta',
      title: 'Zeta',
      publishedAt: new Date('2026-06-01T00:00:00Z'),
    });
    await seedArticle(deps, {
      id: 'alfa',
      title: 'Alfa',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect((await itemsFor(deps, 'newest')).map((one) => one.title)).toEqual([
      'Zeta',
      'Alfa',
    ]);
  });

  /*
   * The opposite of the editor's own feed: a reader arriving at an
   * archive is owed the most recent thing at the top, and a missing date
   * means "we do not know", not "today".
   */
  it('sorts a page with no date last, not first', async () => {
    const deps = setup();
    await seedArticle(deps, {
      id: 'undated',
      title: 'Undated',
      publishedAt: null,
    });
    await seedArticle(deps, {
      id: 'dated',
      title: 'Dated',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect((await itemsFor(deps, 'newest')).map((one) => one.title)).toEqual([
      'Dated',
      'Undated',
    ]);
  });

  it('gives two grids on one page their own order over the same term', async () => {
    const deps = setup();
    await seedArticle(deps, {
      id: 'zeta',
      title: 'Zeta',
      publishedAt: new Date('2026-06-01T00:00:00Z'),
    });
    await seedArticle(deps, {
      id: 'alfa',
      title: 'Alfa',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const [content] = await resolvePageGridItems(deps, tenantId, siteId, 'it', [
      [grid('title'), { ...grid('newest'), id: 'grid-2' }],
    ]);

    const titles = (block: Block) =>
      (block.props['items'] as PageGridItem[]).map((one) => one.title);
    expect(titles(content[0])).toEqual(['Alfa', 'Zeta']);
    expect(titles(content[1])).toEqual(['Zeta', 'Alfa']);
  });

  describe('an author page', () => {
    async function seedWritten(
      deps: ReturnType<typeof setup>,
      input: {
        id: string;
        title: string;
        createdBy: string;
        collectionId: string | null;
      },
    ) {
      const group = PageGroup.create({
        id: input.id,
        tenantId,
        siteId,
        createdBy: input.createdBy,
        collectionId: input.collectionId,
      });
      await deps.pageGroupRepository.add(group);
      const translation = PageTranslation.create({
        id: `${input.id}-it`,
        tenantId,
        siteId,
        pageGroupId: group.id,
        locale: 'it',
        slug: input.id,
        seoMeta: { title: input.title, description: '' },
      });
      translation.publish([], { by: null });
      await deps.pageTranslationRepository.add(translation, null);
    }

    const authorGrid = (
      authorId: string,
      termId: string | null = null,
    ): Block => ({
      id: 'grid-author',
      type: 'PageGrid',
      props: { termId, authorId, order: 'title', items: [] },
    });

    it('lists the articles the person wrote, and nothing else they made', async () => {
      const deps = setup();
      await seedWritten(deps, {
        id: 'b',
        title: 'Beta',
        createdBy: 'giulia',
        collectionId: 'news',
      });
      await seedWritten(deps, {
        id: 'a',
        title: 'Alfa',
        createdBy: 'giulia',
        collectionId: 'blog',
      });
      await seedWritten(deps, {
        id: 'home',
        title: 'Home',
        createdBy: 'giulia',
        collectionId: null,
      });
      await seedWritten(deps, {
        id: 'c',
        title: 'Di Mario',
        createdBy: 'mario',
        collectionId: 'news',
      });

      const [content] = await resolvePageGridItems(
        deps,
        tenantId,
        siteId,
        'it',
        [[authorGrid('giulia')]],
      );

      expect(
        (content[0].props['items'] as PageGridItem[]).map((item) => item.title),
      ).toEqual(['Alfa', 'Beta']);
    });

    it('lists a term when the grid names one, whoever wrote the pages', async () => {
      const deps = setup();
      await seedArticle(deps, {
        id: 'termed',
        title: 'Nel termine',
        publishedAt: new Date('2026-03-01T00:00:00Z'),
      });
      await seedWritten(deps, {
        id: 'mine',
        title: 'Mio',
        createdBy: 'giulia',
        collectionId: 'news',
      });

      const [content] = await resolvePageGridItems(
        deps,
        tenantId,
        siteId,
        'it',
        [[authorGrid('giulia', termId)]],
      );

      expect(
        (content[0].props['items'] as PageGridItem[]).map((item) => item.title),
      ).toEqual(['Nel termine']);
    });

    it('gives someone who wrote nothing an empty list', async () => {
      const deps = setup();

      const [content] = await resolvePageGridItems(
        deps,
        tenantId,
        siteId,
        'it',
        [[authorGrid('nobody')]],
      );

      expect(content[0].props['items']).toEqual([]);
    });
  });
});
