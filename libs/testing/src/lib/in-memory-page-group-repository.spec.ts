import { describe, expect, it } from 'vitest';
import type { PageGroupListFilters } from '@kometio/ports';
import {
  InMemoryPageGroupRepository,
  InMemoryPageTranslationRepository,
} from './in-memory-repositories.test-fixture';
import {
  PAGE_LIST_STATE_CASES,
  buildPageForListStateCase,
} from './page-list-state-cases.test-fixture';

/*
 * The fake answers the port's list filters in memory, and a spec that goes
 * through it trusts it to. A filter it ignored would hand back every page,
 * and nothing in such a spec would say why a result had too many.
 */

const TENANT = 'tenant-1';
const SITE = 'site-1';
const EVERYTHING = { page: 1, pageSize: 100 };

interface PageOptions {
  languages?: { locale: string; published?: boolean }[];
  title?: string;
  parentId?: string;
  createdBy?: string;
  collectionId?: string;
}

async function setup() {
  const translations = new InMemoryPageTranslationRepository();
  const groups = new InMemoryPageGroupRepository(undefined, translations);

  const page = async (id: string, options: PageOptions = {}) => {
    const { group, translations: entities } = buildPageForListStateCase(
      {
        name: id,
        defaultLocale: 'it',
        translations: options.languages ?? [],
        expected: { shown: null, state: null },
      },
      {
        id,
        tenantId: TENANT,
        siteId: SITE,
        title: options.title,
        group: {
          parentId: options.parentId,
          createdBy: options.createdBy,
          collectionId: options.collectionId,
        },
      },
    );
    await groups.add(group);
    for (const translation of entities) {
      await translations.add(translation, options.parentId ?? null);
    }
    return id;
  };

  const idsOf = async (filters: PageGroupListFilters) =>
    (await groups.listBySiteFiltered(TENANT, SITE, EVERYTHING, filters)).items
      .map((item) => item.id)
      .sort();

  return { page, idsOf, groups, translations };
}

describe('InMemoryPageGroupRepository.listBySiteFiltered', () => {
  describe('status', () => {
    /** The shared cases: the same ones the SQL of the page repository answers (page-list-state-cases.test-fixture.ts). */
    it.each(PAGE_LIST_STATE_CASES.map((c) => [c.name, c] as const))(
      '%s',
      async (_name, listCase) => {
        const { idsOf, groups, translations } = await setup();
        const { group, translations: entities } = buildPageForListStateCase(
          listCase,
          { id: 'page', tenantId: TENANT, siteId: SITE },
        );
        await groups.add(group);
        for (const translation of entities) {
          await translations.add(translation, null);
        }

        for (const state of ['draft', 'published', 'pending'] as const) {
          const found = await idsOf({
            status: { state, defaultLocale: listCase.defaultLocale },
          });

          expect(found.includes('page')).toBe(
            listCase.expected.state === state,
          );
        }
      },
    );

    it('hands a page’s languages back in the order of their codes, so the first is the one the filter judges', async () => {
      const { page, groups } = await setup();
      await page('page', {
        languages: [{ locale: 'en' }, { locale: 'de', published: true }],
      });

      const result = await groups.listBySiteFiltered(
        TENANT,
        SITE,
        EVERYTHING,
        {},
      );

      expect(result.items[0]?.translations.map((t) => t.locale)).toEqual([
        'de',
        'en',
      ]);
    });

    it('counts the same pages it lists', async () => {
      const { page, groups } = await setup();
      for (const id of ['a', 'b', 'c']) {
        await page(id, { languages: [{ locale: 'it', published: true }] });
      }

      const result = await groups.listBySiteFiltered(
        TENANT,
        SITE,
        { page: 1, pageSize: 1 },
        { status: { state: 'published', defaultLocale: 'it' } },
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(3);
    });
  });

  describe('every filter the port has', () => {
    /*
     * One entry per filter, and the record is typed as all of them: a new
     * filter fails to compile here until it has a value, and then the
     * test below holds the fake to answering it.
     */
    const aloneAndMatchingNothing: Record<
      keyof PageGroupListFilters,
      PageGroupListFilters
    > = {
      search: { search: 'no page is called this' },
      createdAfter: { createdAfter: new Date('2100-01-01T00:00:00Z') },
      createdBefore: { createdBefore: new Date('1970-01-01T00:00:00Z') },
      createdBy: { createdBy: 'nobody' },
      locale: { locale: 'xx' },
      collectionId: { collectionId: 'no-such-section' },
      excludeSubtreeOf: { excludeSubtreeOf: 'root' },
      status: { status: { state: 'pending', defaultLocale: 'it' } },
    };

    it.each(Object.entries(aloneAndMatchingNothing))(
      'narrows the list: %s',
      async (_name, filters) => {
        const { page, idsOf } = await setup();
        await page('root', {
          languages: [{ locale: 'it' }],
          createdBy: 'someone',
        });
        await page('child', {
          languages: [{ locale: 'it' }],
          parentId: 'root',
          createdBy: 'someone',
        });
        expect(await idsOf({})).toEqual(['child', 'root']);

        expect(await idsOf(filters)).toEqual([]);
      },
    );
  });
});
