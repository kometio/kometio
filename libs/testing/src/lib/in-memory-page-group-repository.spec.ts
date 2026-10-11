import { describe, expect, it } from 'vitest';
import type { PageGroupListFilters } from '@kometio/ports';
import { buildPageGroup, buildPageTranslation } from './entities.test-fixture';
import {
  InMemoryPageGroupRepository,
  InMemoryPageTranslationRepository,
} from './in-memory-repositories.test-fixture';

/*
 * The fake answers the port's list filters in memory, and a spec that goes
 * through it trusts it to. A filter it ignored would hand back every page,
 * and nothing in such a spec would say why a result had too many.
 */

const TENANT = 'tenant-1';
const SITE = 'site-1';
const T0 = new Date('2026-01-01T00:00:00Z');
const PUBLISHED_AT = new Date('2026-04-01T00:00:00Z');
const LATER = new Date('2026-06-01T00:00:00Z');
const EVERYTHING = { page: 1, pageSize: 100 };

interface LanguageOf {
  locale: string;
  published?: boolean;
  diverged?: boolean;
}

interface PageOptions {
  languages?: LanguageOf[];
  title?: string;
  parentId?: string;
  createdBy?: string;
  collectionId?: string;
  /** The shared structure changed at this time, after any publication. */
  sharedChangedAt?: Date;
}

async function setup() {
  const translations = new InMemoryPageTranslationRepository();
  const groups = new InMemoryPageGroupRepository(undefined, translations);

  const page = async (id: string, options: PageOptions = {}) => {
    const group = buildPageGroup({
      id,
      tenantId: TENANT,
      siteId: SITE,
      parentId: options.parentId ?? null,
      createdBy: options.createdBy ?? null,
      collectionId: options.collectionId ?? null,
      now: T0,
    });
    if (options.sharedChangedAt) {
      group.saveContent(
        [{ id: `b-${id}`, type: 'Text', props: { body: id } }],
        { by: null, now: options.sharedChangedAt },
      );
    }
    await groups.add(group);
    for (const language of options.languages ?? []) {
      // Created before it is published, as it is in life: a translation
      // made after its own publication would read as having changes
      // waiting.
      const translation = buildPageTranslation({
        id: `${id}-${language.locale}`,
        tenantId: TENANT,
        siteId: SITE,
        pageGroupId: id,
        locale: language.locale,
        slug: `${id}-${language.locale}`,
        seoMeta: { title: options.title ?? id, description: '' },
        now: T0,
      });
      if (language.diverged) translation.diverge([], { by: null, now: T0 });
      if (language.published) {
        translation.publish([], { by: null, now: PUBLISHED_AT });
      }
      await translations.add(translation, options.parentId ?? null);
    }
    return id;
  };

  const idsOf = async (filters: PageGroupListFilters) =>
    (await groups.listBySiteFiltered(TENANT, SITE, EVERYTHING, filters)).items
      .map((item) => item.id)
      .sort();

  return { page, idsOf, groups };
}

describe('InMemoryPageGroupRepository.listBySiteFiltered', () => {
  describe('status', () => {
    const state = (
      value: 'draft' | 'published' | 'pending',
      defaultLocale = 'it',
    ) => ({ status: { state: value, defaultLocale } });

    async function seed() {
      const { page, idsOf, groups } = await setup();
      const pages = {
        draft: await page('draft', { languages: [{ locale: 'it' }] }),
        published: await page('published', {
          languages: [{ locale: 'it', published: true }],
        }),
        pending: await page('pending', {
          languages: [{ locale: 'it', published: true }],
          sharedChangedAt: LATER,
        }),
        // Its own structure: what changed in the shared one is not its.
        divergedIsClean: await page('diverged', {
          languages: [{ locale: 'it', published: true, diverged: true }],
          sharedChangedAt: LATER,
        }),
        // The default language decides, whatever the others are.
        defaultWins: await page('default-wins', {
          languages: [{ locale: 'it', published: true }, { locale: 'en' }],
        }),
        // No default language: the first by code — "de" — decides.
        firstByCode: await page('first-by-code', {
          languages: [{ locale: 'en' }, { locale: 'de', published: true }],
        }),
        // Nothing to show: it is in no state.
        noLanguage: await page('no-language'),
      };
      return { pages, idsOf, groups };
    }

    it('finds the pages in each state, judged by the language the row shows', async () => {
      const { pages, idsOf } = await seed();

      expect(await idsOf(state('draft'))).toEqual([pages.draft]);
      expect(await idsOf(state('published'))).toEqual(
        [
          pages.published,
          pages.divergedIsClean,
          pages.defaultWins,
          pages.firstByCode,
        ].sort(),
      );
      expect(await idsOf(state('pending'))).toEqual([pages.pending]);
    });

    it('takes the site’s default language wherever the page has it', async () => {
      const { pages, idsOf } = await seed();

      // With "en" as the default, "default-wins" and "first-by-code" are
      // judged by their draft English; the pages with no English, by the
      // only language they have.
      expect(await idsOf(state('draft', 'en'))).toEqual(
        [pages.draft, pages.defaultWins, pages.firstByCode].sort(),
      );
    });

    it('agrees, page by page, with the state the row itself reports', async () => {
      const { pages, idsOf, groups } = await seed();
      const all = await groups.listBySiteFiltered(TENANT, SITE, EVERYTHING, {});
      expect(all.items).toHaveLength(Object.keys(pages).length);

      const stateOf = (item: (typeof all.items)[number]) => {
        const shown =
          item.translations.find((t) => t.locale === 'it') ??
          item.translations[0];
        if (!shown) return null;
        if (shown.status !== 'published') return 'draft';
        return shown.hasUnpublishedChanges ? 'pending' : 'published';
      };
      for (const value of ['draft', 'published', 'pending'] as const) {
        const expected = all.items
          .filter((item) => stateOf(item) === value)
          .map((item) => item.id)
          .sort();
        expect(await idsOf(state(value))).toEqual(expected);
      }
    });

    it('hands a page’s languages back in the order of their codes, so the first is the one the filter judges', async () => {
      const { pages, groups } = await seed();

      const result = await groups.listBySiteFiltered(
        TENANT,
        SITE,
        EVERYTHING,
        {},
      );

      const row = result.items.find((item) => item.id === pages.firstByCode);
      expect(row?.translations.map((t) => t.locale)).toEqual(['de', 'en']);
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
