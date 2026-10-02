import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PageGroupCannotBeItsOwnAncestorError,
  Collection,
  PageGroup,
  PageGroupNotFoundError,
  PageSlugAlreadyExistsError,
  PageTranslationNotFoundError,
  PageTranslation,
  PageTranslationLocaleAlreadyExistsError,
} from '@kometio/domain-core';
import {
  type KometioDb,
  createAppDb,
  pageGroups,
  withTenant,
} from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  createIntegrationUser,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleCollectionRepository } from './drizzle-collection.repository';
import { DrizzlePageGroupRepository } from './drizzle-page-group.repository';
import { DrizzlePageGroupVersionRepository } from './drizzle-page-group-version.repository';
import { DrizzlePageTranslationRepository } from './drizzle-page-translation.repository';
import { DrizzlePageTranslationVersionRepository } from './drizzle-page-translation-version.repository';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, same as production code — this is also the RLS regression
 * test for the new i18n tables, same reasoning as
 * drizzle-page.repository.integration.spec.ts.
 */
describe('DrizzlePageGroupRepository / DrizzlePageTranslationRepository (integration)', () => {
  let db: KometioDb;
  let collectionRepository: DrizzleCollectionRepository;
  let groupRepository: DrizzlePageGroupRepository;
  let groupVersionRepository: DrizzlePageGroupVersionRepository;
  let translationRepository: DrizzlePageTranslationRepository;
  let translationVersionRepository: DrizzlePageTranslationVersionRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;
  let userAId: string;

  beforeAll(async () => {
    db = createAppDb();
    collectionRepository = new DrizzleCollectionRepository(db);
    groupRepository = new DrizzlePageGroupRepository(db);
    groupVersionRepository = new DrizzlePageGroupVersionRepository(db);
    translationRepository = new DrizzlePageTranslationRepository(db);
    translationVersionRepository = new DrizzlePageTranslationVersionRepository(
      db,
    );

    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Integration Tenant B');

    siteAId = await createIntegrationSite(db, tenantAId);

    userAId = await createIntegrationUser(db, tenantAId, {
      displayName: 'Ada Lovelace',
    });
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  function buildGroup(
    overrides: Partial<Parameters<typeof PageGroup.create>[0]> = {},
  ) {
    return PageGroup.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      ...overrides,
    });
  }

  function buildTranslation(
    pageGroupId: string,
    overrides: Partial<Parameters<typeof PageTranslation.create>[0]> = {},
  ) {
    return PageTranslation.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      pageGroupId,
      locale: 'it',
      slug: `page-${randomUUID()}`,
      seoMeta: { title: 'Title', description: 'Description' },
      ...overrides,
    });
  }

  function groupVersionOf(group: PageGroup) {
    return {
      id: randomUUID(),
      tenantId: group.tenantId,
      pageGroupId: group.id,
      content: group.content,
      createdBy: null,
      createdAt: group.updatedAt,
    };
  }

  describe('PageGroup', () => {
    it('saves and retrieves a group by id, scoped to its tenant', async () => {
      const group = buildGroup({
        content: [{ type: 'Hero', props: { title: 'Ciao' } }],
      });
      await groupRepository.add(group);

      const found = await groupRepository.findById(tenantAId, group.id);
      expect(found?.id).toBe(group.id);
      expect(found?.content).toEqual([
        { type: 'Hero', props: { title: 'Ciao' } },
      ]);

      const foundFromOtherTenant = await groupRepository.findById(
        tenantBId,
        group.id,
      );
      expect(foundFromOtherTenant).toBeNull();
    });

    it('listBySite scopes by tenant and site, ordered by sibling position then createdAt', async () => {
      const older = buildGroup({ now: new Date(Date.now() - 1000) });
      const newer = buildGroup({ now: new Date() });
      await groupRepository.add(older);
      await groupRepository.add(newer);

      const found = await groupRepository.listBySite(tenantAId, siteAId, {
        page: 1,
        pageSize: 100,
      });
      const foundIds = found.items.map((g) => g.id);
      expect(foundIds.indexOf(older.id)).toBeLessThan(
        foundIds.indexOf(newer.id),
      );

      const foundFromOtherTenant = await groupRepository.listBySite(
        tenantBId,
        siteAId,
        { page: 1, pageSize: 100 },
      );
      expect(foundFromOtherTenant.items).toHaveLength(0);
    });

    it('listSiblings scopes to one exact parentId, ordered by position', async () => {
      const root = buildGroup({});
      await groupRepository.add(root);
      const childA = buildGroup({ parentId: root.id, order: 1 });
      const childB = buildGroup({ parentId: root.id, order: 0 });
      const grandchild = buildGroup({ parentId: childA.id });
      await groupRepository.add(childA);
      await groupRepository.add(childB);
      await groupRepository.add(grandchild);

      const siblings = await groupRepository.listSiblings(
        tenantAId,
        siteAId,
        root.id,
      );
      expect(siblings.map((g) => g.id)).toEqual([childB.id, childA.id]);
    });

    it('saveContent writes the block tree of the page and nothing else', async () => {
      const parent = buildGroup();
      await groupRepository.add(parent);
      const group = buildGroup();
      await groupRepository.add(group);
      // Read before a move lands: the stale copy still has no parent.
      const stale = await groupRepository.findById(tenantAId, group.id);
      group.setParent(parent.id, { by: null });
      await groupRepository.move(group, []);

      stale?.saveContent([{ type: 'Text', props: { body: 'updated' } }], {
        by: null,
      });
      if (stale)
        await groupRepository.saveContent(stale, groupVersionOf(stale));

      const found = await groupRepository.findById(tenantAId, group.id);
      expect(found?.content).toEqual([
        { type: 'Text', props: { body: 'updated' } },
      ]);
      // The move that landed in between is still there.
      expect(found?.parentId).toBe(parent.id);
    });

    it('never brings a deleted page back when a save arrives after the delete', async () => {
      const group = buildGroup();
      await groupRepository.add(group);
      await groupRepository.delete(tenantAId, group.id);

      group.saveContent([{ type: 'Text', props: { body: 'late' } }], {
        by: null,
      });
      await expect(
        groupRepository.saveContent(group, groupVersionOf(group)),
      ).rejects.toBeInstanceOf(PageGroupNotFoundError);
      expect(await groupRepository.findById(tenantAId, group.id)).toBeNull();
    });

    it('reorders siblings in one statement, touching only their order', async () => {
      const parent = buildGroup();
      await groupRepository.add(parent);
      const first = buildGroup({
        parentId: parent.id,
        content: [{ type: 'Text', props: { body: 'first' } }],
      });
      const second = buildGroup({ parentId: parent.id });
      await groupRepository.add(first);
      await groupRepository.add(second);

      await groupRepository.reorderSiblings({
        tenantId: tenantAId,
        siteId: siteAId,
        parentId: parent.id,
        orderedIds: [second.id, first.id],
        by: userAId,
        at: new Date(),
      });

      const [foundFirst, foundSecond] = await Promise.all([
        groupRepository.findById(tenantAId, first.id),
        groupRepository.findById(tenantAId, second.id),
      ]);
      expect([foundSecond?.order, foundFirst?.order]).toEqual([0, 1]);
      expect(foundFirst?.content).toEqual([
        { type: 'Text', props: { body: 'first' } },
      ]);
    });

    /*
     * Two pages moved under each other at the same moment each found the
     * other's old place fine, and together made a loop that took both
     * off the site (audit B12). Ten pairs at once, each on a site of its
     * own, so the moves really overlap.
     */
    it('lets only one of two crossing moves through, so no loop is made', async () => {
      const pairs = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const siteId = await createIntegrationSite(db, tenantAId);
          const first = buildGroup({ siteId });
          const second = buildGroup({ siteId });
          await groupRepository.add(first);
          await groupRepository.add(second);
          first.setParent(second.id, { by: null });
          second.setParent(first.id, { by: null });
          return { first, second };
        }),
      );

      const outcomes = await Promise.all(
        pairs.map(({ first, second }) =>
          Promise.allSettled([
            groupRepository.move(first, []),
            groupRepository.move(second, []),
          ]),
        ),
      );

      for (const pair of outcomes) {
        expect(pair.map((outcome) => outcome.status).sort()).toEqual([
          'fulfilled',
          'rejected',
        ]);
        const refusal = pair.find(
          (outcome): outcome is PromiseRejectedResult =>
            outcome.status === 'rejected',
        );
        expect(refusal?.reason).toBeInstanceOf(
          PageGroupCannotBeItsOwnAncestorError,
        );
      }
      for (const { first, second } of pairs) {
        const stored = await Promise.all([
          groupRepository.findById(tenantAId, first.id),
          groupRepository.findById(tenantAId, second.id),
        ]);
        expect(stored.filter((group) => group?.parentId === null)).toHaveLength(
          1,
        );
      }
    });

    it('deletes a group scoped to its tenant', async () => {
      const group = buildGroup();
      await groupRepository.add(group);

      await groupRepository.delete(tenantAId, group.id);

      expect(await groupRepository.findById(tenantAId, group.id)).toBeNull();
    });

    it('refuses to delete a page that has subpages, and deletes it once it has none', async () => {
      const parent = buildGroup();
      await groupRepository.add(parent);
      const child = buildGroup({ parentId: parent.id });
      await groupRepository.add(child);
      await translationRepository.add(buildTranslation(child.id), parent.id);

      expect(await groupRepository.countChildren(tenantAId, parent.id)).toBe(1);
      // Past the use case's own check: the database refuses it too.
      await expect(
        groupRepository.delete(tenantAId, parent.id),
      ).rejects.toMatchObject({
        name: 'PageGroupHasChildrenError',
        childCount: 1,
      });
      expect(
        await groupRepository.findById(tenantAId, parent.id),
      ).not.toBeNull();

      await groupRepository.delete(tenantAId, child.id);
      await groupRepository.delete(tenantAId, parent.id);
      expect(await groupRepository.findById(tenantAId, parent.id)).toBeNull();
    });

    describe('listBySiteFiltered', () => {
      it('says how many pages hang directly under each one, even when a filter leaves them out', async () => {
        const marker = randomUUID().slice(0, 8);
        const parent = buildGroup();
        await groupRepository.add(parent);
        await translationRepository.add(
          buildTranslation(parent.id, {
            seoMeta: { title: `Servizi ${marker}`, description: '' },
          }),
          null,
        );
        const children = [
          buildGroup({ parentId: parent.id }),
          buildGroup({ parentId: parent.id }),
        ];
        for (const child of children) {
          await groupRepository.add(child);
          // Titles that the search below does not match.
          await translationRepository.add(
            buildTranslation(child.id, {
              seoMeta: { title: `Altro ${randomUUID()}`, description: '' },
            }),
            parent.id,
          );
        }
        const grandchild = buildGroup({ parentId: children[0]?.id });
        await groupRepository.add(grandchild);

        const filtered = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 20 },
          { search: marker },
        );
        const all = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 100 },
          {},
        );

        // Only the parent is in the filtered list, and it still knows its two.
        expect(filtered.items.map((item) => item.id)).toEqual([parent.id]);
        expect(filtered.items[0]?.childCount).toBe(2);
        // Directly under it only: the grandchild is the first child's.
        const byId = new Map(
          all.items.map((item) => [item.id, item.childCount]),
        );
        expect(byId.get(children[0]?.id ?? '')).toBe(1);
        expect(byId.get(children[1]?.id ?? '')).toBe(0);
        expect(byId.get(grandchild.id)).toBe(0);
      });

      it('lists a group with all its translations summarized', async () => {
        const group = buildGroup();
        await groupRepository.add(group);
        const itSlug = `chi-siamo-${randomUUID()}`;
        const enSlug = `about-us-${randomUUID()}`;
        const itTranslation = buildTranslation(group.id, {
          locale: 'it',
          slug: itSlug,
          seoMeta: { title: 'Chi siamo', description: '' },
        });
        await translationRepository.add(itTranslation, null);
        const enTranslation = buildTranslation(group.id, {
          locale: 'en',
          slug: enSlug,
          seoMeta: { title: 'About us', description: '' },
        });
        await translationRepository.add(enTranslation, null);

        const result = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 20 },
          {},
        );

        const row = result.items.find((item) => item.id === group.id);
        expect(
          row?.translations.sort((a, b) => a.locale.localeCompare(b.locale)),
        ).toEqual([
          {
            locale: 'en',
            slug: enSlug,
            title: 'About us',
            status: 'draft',
            isDiverged: false,
            hasUnpublishedChanges: false,
          },
          {
            locale: 'it',
            slug: itSlug,
            title: 'Chi siamo',
            status: 'draft',
            isDiverged: false,
            hasUnpublishedChanges: false,
          },
        ]);
      });

      /*
       * Two joins onto `users` from the same row — who created the page
       * and who last touched it — plus a "latest edit in any language"
       * that the group row alone cannot answer.
       */
      it('reports the last edit in ANY language, with its author', async () => {
        const group = buildGroup({
          createdBy: userAId,
          now: new Date('2026-01-01T00:00:00Z'),
        });
        await groupRepository.add(group);
        const translation = buildTranslation(group.id);
        translation.saveFieldValues(
          { 'block-1': { title: 'Ciao' } },
          { by: userAId, now: new Date('2026-05-01T00:00:00Z') },
        );
        await translationRepository.add(translation, null);

        const result = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 20 },
          {},
        );

        const row = result.items.find((item) => item.id === group.id);
        expect(row?.createdByName).toBe('Ada Lovelace');
        expect(row?.lastEditedByName).toBe('Ada Lovelace');
        // The translation was edited AFTER the group was created, and it
        // is the translation's clock the row has to report.
        expect(row?.lastEditedAt).toEqual(new Date('2026-05-01T00:00:00Z'));
      });

      /*
       * Three different questions, and the middle one is the reason
       * `collectionId` is nullable-with-meaning rather than absent:
       * "every page", "the pages in no section", "the pages in this one".
       */
      it('tells apart every page, the pages in no section, and the pages in one', async () => {
        const collection = Collection.create({
          id: randomUUID(),
          tenantId: tenantAId,
          siteId: siteAId,
          name: `News ${randomUUID()}`,
        });
        await collectionRepository.add(collection);
        const filed = buildGroup({ collectionId: collection.id });
        await groupRepository.add(filed);
        const loose = buildGroup();
        await groupRepository.add(loose);

        const list = (collectionId: string | null | undefined) =>
          groupRepository.listBySiteFiltered(
            tenantAId,
            siteAId,
            { page: 1, pageSize: 100 },
            collectionId === undefined ? {} : { collectionId },
          );

        const everything = (await list(undefined)).items.map((one) => one.id);
        expect(everything).toEqual(
          expect.arrayContaining([filed.id, loose.id]),
        );

        const inNoSection = (await list(null)).items.map((one) => one.id);
        expect(inNoSection).toContain(loose.id);
        expect(inNoSection).not.toContain(filed.id);

        const inSection = (await list(collection.id)).items.map(
          (one) => one.id,
        );
        expect(inSection).toEqual([filed.id]);
      });

      it('a feed comes back newest first, with what was never published on top', async () => {
        const collection = Collection.create({
          id: randomUUID(),
          tenantId: tenantAId,
          siteId: siteAId,
          name: `News ${randomUUID()}`,
        });
        await collectionRepository.add(collection);

        async function article(publishedAt: Date | null) {
          const group = buildGroup({ collectionId: collection.id });
          await groupRepository.add(group);
          const translation = buildTranslation(group.id);
          if (publishedAt) {
            translation.publish([], { by: null, now: publishedAt });
          }
          await translationRepository.add(translation, null);
          return group.id;
        }

        const older = await article(new Date('2026-01-01T00:00:00Z'));
        const newer = await article(new Date('2026-06-01T00:00:00Z'));
        const draft = await article(null);

        const result = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 100 },
          { collectionId: collection.id },
          'newest',
        );

        expect(result.items.map((one) => one.id)).toEqual([
          draft,
          newer,
          older,
        ]);
      });

      it('flags a published translation whose SHARED structure changed afterwards', async () => {
        const group = buildGroup({ now: new Date('2026-01-01T00:00:00Z') });
        await groupRepository.add(group);
        const translation = buildTranslation(group.id);
        translation.publish([], {
          by: null,
          now: new Date('2026-04-01T00:00:00Z'),
        });
        await translationRepository.add(translation, null);
        group.saveContent([{ id: 'b', type: 'Text', props: { body: 'new' } }], {
          by: null,
          now: new Date('2026-06-01T00:00:00Z'),
        });
        await groupRepository.saveContent(group, groupVersionOf(group));

        const result = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 20 },
          {},
        );

        const row = result.items.find((item) => item.id === group.id);
        expect(row?.translations[0]?.hasUnpublishedChanges).toBe(true);
      });

      it('filters by title, case-insensitively, matching any translation', async () => {
        const matching = buildGroup();
        await groupRepository.add(matching);
        await translationRepository.add(
          buildTranslation(matching.id, {
            seoMeta: { title: 'Idraulico a Roma', description: '' },
          }),
          null,
        );
        const nonMatching = buildGroup();
        await groupRepository.add(nonMatching);
        await translationRepository.add(
          buildTranslation(nonMatching.id, {
            seoMeta: { title: 'Contatti', description: '' },
          }),
          null,
        );

        const result = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 20 },
          { search: 'idraulico' },
        );

        const ids = result.items.map((item) => item.id);
        expect(ids).toContain(matching.id);
        expect(ids).not.toContain(nonMatching.id);
      });

      describe('status', () => {
        const T0 = new Date('2026-01-01T00:00:00Z');
        const PUBLISHED_AT = new Date('2026-04-01T00:00:00Z');
        const LATER = new Date('2026-06-01T00:00:00Z');

        /** One page per state and language shape, all findable by one word in their title. */
        async function seed() {
          const word = `stato${randomUUID().replace(/-/g, '').slice(0, 10)}`;
          const make = async (
            label: string,
            translations: {
              locale: string;
              published?: boolean;
              diverged?: boolean;
            }[],
            sharedChangedAt?: Date,
          ) => {
            const group = buildGroup({ now: T0 });
            await groupRepository.add(group);
            for (const t of translations) {
              // Created before it is published, as it is in life: a
              // translation made after its own publication would read as
              // having changes waiting.
              const translation = buildTranslation(group.id, {
                locale: t.locale,
                seoMeta: { title: `${word} ${label}`, description: '' },
                now: T0,
              });
              if (t.diverged) translation.diverge([], { by: null, now: T0 });
              if (t.published) {
                translation.publish([], { by: null, now: PUBLISHED_AT });
              }
              await translationRepository.add(translation, null);
            }
            if (sharedChangedAt) {
              group.saveContent(
                [{ id: `b-${label}`, type: 'Text', props: { body: label } }],
                { by: null, now: sharedChangedAt },
              );
              await groupRepository.saveContent(group, groupVersionOf(group));
            }
            return group.id;
          };
          const pages = {
            draft: await make('draft', [{ locale: 'it' }]),
            published: await make('published', [
              { locale: 'it', published: true },
            ]),
            pending: await make(
              'pending',
              [{ locale: 'it', published: true }],
              LATER,
            ),
            // Its own structure: what changed in the shared one is not its.
            divergedIsClean: await make(
              'diverged',
              [{ locale: 'it', published: true, diverged: true }],
              LATER,
            ),
            // The default language decides, whatever the others are.
            defaultWins: await make('default-wins', [
              { locale: 'it', published: true },
              { locale: 'en' },
            ]),
            // No default language: the first by code — "de" — decides.
            firstByCode: await make('first-by-code', [
              { locale: 'en' },
              { locale: 'de', published: true },
            ]),
          };
          return { word, pages };
        }

        async function idsIn(
          word: string,
          state: 'draft' | 'published' | 'pending',
        ) {
          const result = await groupRepository.listBySiteFiltered(
            tenantAId,
            siteAId,
            { page: 1, pageSize: 100 },
            { search: word, status: { state, defaultLocale: 'it' } },
          );
          return result.items.map((item) => item.id).sort();
        }

        it('finds the pages in each state, judged by the language the row shows', async () => {
          const { word, pages } = await seed();

          expect(await idsIn(word, 'draft')).toEqual([pages.draft].sort());
          expect(await idsIn(word, 'published')).toEqual(
            [
              pages.published,
              pages.divergedIsClean,
              pages.defaultWins,
              pages.firstByCode,
            ].sort(),
          );
          expect(await idsIn(word, 'pending')).toEqual([pages.pending]);
        });

        it('agrees, page by page, with the state the row itself reports', async () => {
          const { word, pages } = await seed();
          const all = await groupRepository.listBySiteFiltered(
            tenantAId,
            siteAId,
            { page: 1, pageSize: 100 },
            { search: word },
          );
          expect(all.items).toHaveLength(Object.keys(pages).length);

          const stateOf = (item: (typeof all.items)[number]) => {
            const shown =
              item.translations.find((t) => t.locale === 'it') ??
              item.translations[0];
            if (shown?.status !== 'published') return 'draft';
            return shown.hasUnpublishedChanges ? 'pending' : 'published';
          };
          for (const state of ['draft', 'published', 'pending'] as const) {
            const filtered = await idsIn(word, state);
            const expected = all.items
              .filter((item) => stateOf(item) === state)
              .map((item) => item.id)
              .sort();
            expect(filtered).toEqual(expected);
          }
        });

        it('counts the same pages it lists', async () => {
          const { word } = await seed();

          const result = await groupRepository.listBySiteFiltered(
            tenantAId,
            siteAId,
            { page: 1, pageSize: 1 },
            {
              search: word,
              status: { state: 'published', defaultLocale: 'it' },
            },
          );

          expect(result.items).toHaveLength(1);
          expect(result.total).toBe(4);
        });

        it('hands a page’s languages back in the order of their codes, so the first is the one the filter judges', async () => {
          const { word, pages } = await seed();

          const result = await groupRepository.listBySiteFiltered(
            tenantAId,
            siteAId,
            { page: 1, pageSize: 100 },
            { search: word },
          );

          const row = result.items.find(
            (item) => item.id === pages.firstByCode,
          );
          expect(row?.translations.map((t) => t.locale)).toEqual(['de', 'en']);
        });
      });

      it('filters by locale — a group with no translation in that locale is excluded', async () => {
        const withFrench = buildGroup();
        await groupRepository.add(withFrench);
        await translationRepository.add(
          buildTranslation(withFrench.id, { locale: 'fr' }),
          null,
        );
        const withoutFrench = buildGroup();
        await groupRepository.add(withoutFrench);
        await translationRepository.add(
          buildTranslation(withoutFrench.id, { locale: 'de' }),
          null,
        );

        const result = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 20 },
          { locale: 'fr' },
        );

        const ids = result.items.map((item) => item.id);
        expect(ids).toContain(withFrench.id);
        expect(ids).not.toContain(withoutFrench.id);
      });

      it('excludeSubtreeOf leaves out the page and its descendants at every depth', async () => {
        // A recursive walk, not a join per level: the parent picker has
        // to offer every page except the one moving and what hangs under
        // it, and "under it" has no depth limit.
        const root = buildGroup();
        await groupRepository.add(root);
        const child = buildGroup({ parentId: root.id });
        await groupRepository.add(child);
        const grandchild = buildGroup({ parentId: child.id });
        await groupRepository.add(grandchild);
        const unrelated = buildGroup();
        await groupRepository.add(unrelated);

        const result = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 100 },
          { excludeSubtreeOf: root.id },
        );

        const ids = result.items.map((item) => item.id);
        expect(ids).toContain(unrelated.id);
        expect(ids).not.toContain(root.id);
        expect(ids).not.toContain(child.id);
        expect(ids).not.toContain(grandchild.id);
      });

      it('excludeSubtreeOf counts the same pages it lists', async () => {
        // The total drives the pager. Excluding rows from the page but
        // not from the count draws a Next button onto an empty page.
        const root = buildGroup();
        await groupRepository.add(root);
        const child = buildGroup({ parentId: root.id });
        await groupRepository.add(child);

        const all = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 100 },
          {},
        );
        const without = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 100 },
          { excludeSubtreeOf: root.id },
        );

        expect(without.total).toBe(all.total - 2);
      });

      it('filters by createdBy', async () => {
        const byUserA = buildGroup({ createdBy: userAId });
        await groupRepository.add(byUserA);
        const byNoOne = buildGroup({ createdBy: null });
        await groupRepository.add(byNoOne);

        const result = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 20 },
          { createdBy: userAId },
        );

        const ids = result.items.map((item) => item.id);
        expect(ids).toContain(byUserA.id);
        expect(ids).not.toContain(byNoOne.id);
        expect(
          result.items.find((item) => item.id === byUserA.id)?.createdByName,
        ).toBe('Ada Lovelace');
      });

      it('filters by a createdAt date range', async () => {
        const old = buildGroup();
        await groupRepository.add(old);
        await withTenant(db, tenantAId, (tx) =>
          tx
            .update(pageGroups)
            .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
            .where(eq(pageGroups.id, old.id)),
        );
        const recent = buildGroup();
        await groupRepository.add(recent);

        const result = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          // Big enough that the assertion is about the FILTER and not
          // about how many rows the tests before it happened to leave in
          // this tenant: tree order puts the newest last.
          { page: 1, pageSize: 200 },
          { createdAfter: new Date('2024-01-01T00:00:00Z') },
        );

        const ids = result.items.map((item) => item.id);
        expect(ids).toContain(recent.id);
        expect(ids).not.toContain(old.id);
      });

      it('counts (and paginates) by GROUP, not by translation row — a group with 2 translations still counts once', async () => {
        const before = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 1 },
          {},
        );

        const group = buildGroup();
        await groupRepository.add(group);
        await translationRepository.add(
          buildTranslation(group.id, { locale: 'it' }),
          null,
        );
        await translationRepository.add(
          buildTranslation(group.id, { locale: 'en' }),
          null,
        );

        const after = await groupRepository.listBySiteFiltered(
          tenantAId,
          siteAId,
          { page: 1, pageSize: 1 },
          {},
        );

        // +1 group, not +2 (one per translation) — if the query joined and
        // paginated at the translation-row level instead, this would be +2.
        expect(after.total).toBe(before.total + 1);
      });
    });

    describe('addWithVersion and saveContent', () => {
      it('adds the group and its structure version together', async () => {
        const group = buildGroup({
          content: [{ type: 'Hero', props: { title: 'v1' } }],
        });
        const versionId = randomUUID();

        await groupRepository.addWithVersion(group, {
          id: versionId,
          tenantId: tenantAId,
          pageGroupId: group.id,
          content: group.content,
          createdBy: null,
          createdAt: group.updatedAt,
        });

        const foundGroup = await groupRepository.findById(tenantAId, group.id);
        expect(foundGroup?.id).toBe(group.id);
        const versions = await groupVersionRepository.listByGroup(
          tenantAId,
          group.id,
        );
        expect(versions.map((v) => v.id)).toEqual([versionId]);
      });

      it('prunes to the last 10 versions, oldest first', async () => {
        const group = buildGroup();
        await groupRepository.add(group);

        const versionIds: string[] = [];
        for (let i = 0; i < 11; i++) {
          const id = randomUUID();
          versionIds.push(id);
          await groupRepository.saveContent(group, {
            id,
            tenantId: tenantAId,
            pageGroupId: group.id,
            content: [{ type: 'Hero', props: { title: `v${i}` } }],
            createdBy: null,
            createdAt: new Date(Date.now() - (11 - i) * 1000),
          });
        }

        const versions = await groupVersionRepository.listByGroup(
          tenantAId,
          group.id,
        );
        expect(versions).toHaveLength(10);
        expect(versions.map((v) => v.id)).toEqual(versionIds.slice(1));
      });
    });

    describe('addWithTranslation', () => {
      function versionOf(group: PageGroup) {
        return {
          id: randomUUID(),
          tenantId: tenantAId,
          pageGroupId: group.id,
          content: group.content,
          createdBy: null,
          createdAt: group.updatedAt,
        };
      }

      it('writes the group, its version and its first language together', async () => {
        const group = buildGroup();
        const version = versionOf(group);
        const translation = buildTranslation(group.id);

        await groupRepository.addWithTranslation(group, version, translation);

        expect((await groupRepository.findById(tenantAId, group.id))?.id).toBe(
          group.id,
        );
        expect(
          (await groupVersionRepository.listByGroup(tenantAId, group.id)).map(
            (v) => v.id,
          ),
        ).toEqual([version.id]);
        expect(
          (await translationRepository.listByGroup(tenantAId, group.id)).map(
            (t) => t.slug,
          ),
        ).toEqual([translation.slug]);
      });

      /*
       * The address check in the use case can race another request; the
       * constraint is what catches that, and when it does the group must
       * not survive the refusal — a page with no language is the bug this
       * method exists to remove (docs/adr/0072).
       */
      it('writes nothing at all when the language is refused for its address', async () => {
        const slug = `taken-${randomUUID()}`;
        const other = buildGroup();
        await groupRepository.add(other);
        await translationRepository.add(
          buildTranslation(other.id, { slug }),
          null,
        );
        const group = buildGroup();

        await expect(
          groupRepository.addWithTranslation(
            group,
            versionOf(group),
            buildTranslation(group.id, { slug }),
          ),
        ).rejects.toThrow(PageSlugAlreadyExistsError);

        expect(await groupRepository.findById(tenantAId, group.id)).toBeNull();
        expect(
          await groupVersionRepository.listByGroup(tenantAId, group.id),
        ).toEqual([]);
      });
    });
  });

  describe('PageTranslation', () => {
    it('saves and retrieves a translation by id, scoped to its tenant', async () => {
      const group = buildGroup();
      await groupRepository.add(group);
      const translation = buildTranslation(group.id, {
        fieldValues: { 'hero-1': { title: 'Ciao' } },
      });

      await translationRepository.add(translation, group.parentId);

      const found = await translationRepository.findById(
        tenantAId,
        translation.id,
      );
      expect(found?.id).toBe(translation.id);
      expect(found?.fieldValues).toEqual({ 'hero-1': { title: 'Ciao' } });

      const foundFromOtherTenant = await translationRepository.findById(
        tenantBId,
        translation.id,
      );
      expect(foundFromOtherTenant).toBeNull();
    });

    /*
     * The jsonb containment query, against the real column: an in-memory
     * `.some()` would pass whatever shape it was given, and the pair is
     * what public resolution asks about (docs/adr/0074).
     */
    it('findByFormerParent finds the page that used to hang there, and only that pair', async () => {
      const oldParent = buildGroup();
      const newParent = buildGroup();
      await groupRepository.add(oldParent);
      await groupRepository.add(newParent);
      const child = buildGroup({ parentId: oldParent.id });
      await groupRepository.add(child);
      const slug = `moved-${randomUUID()}`;
      const translation = buildTranslation(child.id, { slug });
      await translationRepository.add(translation, oldParent.id);

      translation.recordMovedFrom(oldParent.id, newParent.id, { by: userAId });
      child.setParent(newParent.id, { by: userAId });
      await groupRepository.move(child, [translation]);

      const found = await translationRepository.findByFormerParent(
        tenantAId,
        siteAId,
        'it',
        oldParent.id,
        slug,
      );
      expect(found?.id).toBe(translation.id);

      // The same slug under a different parent is a different page.
      expect(
        await translationRepository.findByFormerParent(
          tenantAId,
          siteAId,
          'it',
          newParent.id,
          slug,
        ),
      ).toBeNull();
      expect(
        await translationRepository.findByFormerParent(
          tenantBId,
          siteAId,
          'it',
          oldParent.id,
          slug,
        ),
      ).toBeNull();
    });

    /*
     * Both rows or neither: the language row carries the parent as well,
     * and a group moved without it would leave the page listed under one
     * parent and findable under another.
     */
    it('move rewrites the group and its languages together', async () => {
      const oldParent = buildGroup();
      const newParent = buildGroup();
      await groupRepository.add(oldParent);
      await groupRepository.add(newParent);
      const child = buildGroup({ parentId: oldParent.id });
      await groupRepository.add(child);
      const italian = buildTranslation(child.id, { locale: 'it' });
      const english = buildTranslation(child.id, { locale: 'en' });
      await translationRepository.add(italian, oldParent.id);
      await translationRepository.add(english, oldParent.id);

      child.setParent(newParent.id, { by: userAId });
      await groupRepository.move(child, [italian, english]);

      expect(
        (await groupRepository.findById(tenantAId, child.id))?.parentId,
      ).toBe(newParent.id);
      for (const translation of [italian, english]) {
        const foundUnderNewParent =
          await translationRepository.findByParentGroupAndLocaleSlug(
            tenantAId,
            siteAId,
            translation.locale,
            newParent.id,
            translation.slug,
          );
        expect(foundUnderNewParent?.id).toBe(translation.id);
      }
    });

    it('findByGroupAndLocale scopes by tenant, group and locale', async () => {
      const group = buildGroup();
      await groupRepository.add(group);
      const it_ = buildTranslation(group.id, { locale: 'it' });
      const en = buildTranslation(group.id, { locale: 'en' });
      await translationRepository.add(it_, null);
      await translationRepository.add(en, null);

      const found = await translationRepository.findByGroupAndLocale(
        tenantAId,
        group.id,
        'en',
      );
      expect(found?.id).toBe(en.id);
    });

    it('listByGroup returns every locale-translation of the same group, scoped to tenant', async () => {
      const group = buildGroup();
      await groupRepository.add(group);
      const otherGroup = buildGroup();
      await groupRepository.add(otherGroup);
      const italian = buildTranslation(group.id, {
        locale: 'it',
        slug: 'chi-siamo',
      });
      const english = buildTranslation(group.id, {
        locale: 'en',
        slug: 'about-us',
      });
      const unrelated = buildTranslation(otherGroup.id, {
        locale: 'it',
        slug: 'contatti',
      });
      await translationRepository.add(italian, null);
      await translationRepository.add(english, null);
      await translationRepository.add(unrelated, null);

      const found = await translationRepository.listByGroup(
        tenantAId,
        group.id,
      );
      expect(found.map((t) => t.locale).sort()).toEqual(['en', 'it']);

      const foundFromOtherTenant = await translationRepository.listByGroup(
        tenantBId,
        group.id,
      );
      expect(foundFromOtherTenant).toHaveLength(0);
    });

    describe('findByParentGroupAndLocaleSlug (public resolution)', () => {
      it('resolves a root-level translation by (site, locale, slug)', async () => {
        const group = buildGroup();
        await groupRepository.add(group);
        const translation = buildTranslation(group.id, {
          locale: 'it',
          slug: 'home',
        });
        await translationRepository.add(translation, null);

        const found =
          await translationRepository.findByParentGroupAndLocaleSlug(
            tenantAId,
            siteAId,
            'it',
            null,
            'home',
          );
        expect(found?.id).toBe(translation.id);
      });

      it('does not match a translation with the same slug under a different parent group', async () => {
        const parentA = buildGroup();
        const parentB = buildGroup();
        await groupRepository.add(parentA);
        await groupRepository.add(parentB);
        const childOfA = buildGroup({ parentId: parentA.id });
        const childOfB = buildGroup({ parentId: parentB.id });
        await groupRepository.add(childOfA);
        await groupRepository.add(childOfB);
        const translationA = buildTranslation(childOfA.id, {
          slug: 'same-slug',
        });
        const translationB = buildTranslation(childOfB.id, {
          slug: 'same-slug',
        });
        await translationRepository.add(translationA, parentA.id);
        await translationRepository.add(translationB, parentB.id);

        const foundUnderA =
          await translationRepository.findByParentGroupAndLocaleSlug(
            tenantAId,
            siteAId,
            'it',
            parentA.id,
            'same-slug',
          );
        expect(foundUnderA?.id).toBe(translationA.id);

        const foundAtRoot =
          await translationRepository.findByParentGroupAndLocaleSlug(
            tenantAId,
            siteAId,
            'it',
            null,
            'same-slug',
          );
        expect(foundAtRoot).toBeNull();
      });
    });

    it('deletes a translation scoped to its tenant', async () => {
      const group = buildGroup();
      await groupRepository.add(group);
      const translation = buildTranslation(group.id);
      await translationRepository.add(translation, null);

      await translationRepository.delete(tenantAId, translation.id);

      expect(
        await translationRepository.findById(tenantAId, translation.id),
      ).toBeNull();
    });

    // Regression: same reasoning as DrizzlePageRepository's own — the
    // check-then-act in the use-case layer isn't atomic, the DB constraint
    // is the real backstop under concurrency.
    it('add() rejects a second ROOT-level translation with the same tenant/site/locale/slug with PageSlugAlreadyExistsError', async () => {
      const group = buildGroup();
      await groupRepository.add(group);
      const otherGroup = buildGroup();
      await groupRepository.add(otherGroup);
      const first = buildTranslation(group.id, { slug: 'stessa-slug' });
      await translationRepository.add(first, null);

      const second = buildTranslation(otherGroup.id, { slug: 'stessa-slug' });
      await expect(translationRepository.add(second, null)).rejects.toThrow(
        PageSlugAlreadyExistsError,
      );
    });

    it('add() rejects a second translation with the same slug under the SAME non-root parent group with PageSlugAlreadyExistsError', async () => {
      const parent = buildGroup();
      await groupRepository.add(parent);
      const groupA = buildGroup({ parentId: parent.id });
      const groupB = buildGroup({ parentId: parent.id });
      await groupRepository.add(groupA);
      await groupRepository.add(groupB);
      const first = buildTranslation(groupA.id, { slug: 'stessa-slug' });
      await translationRepository.add(first, parent.id);

      const second = buildTranslation(groupB.id, { slug: 'stessa-slug' });
      await expect(
        translationRepository.add(second, parent.id),
      ).rejects.toThrow(PageSlugAlreadyExistsError);
    });

    it('add() allows the same slug for two translations under DIFFERENT parent groups (sibling-scoped uniqueness)', async () => {
      const parentA = buildGroup();
      const parentB = buildGroup();
      await groupRepository.add(parentA);
      await groupRepository.add(parentB);
      const groupA = buildGroup({ parentId: parentA.id });
      const groupB = buildGroup({ parentId: parentB.id });
      await groupRepository.add(groupA);
      await groupRepository.add(groupB);
      const first = buildTranslation(groupA.id, { slug: 'stessa-slug' });
      await translationRepository.add(first, parentA.id);

      const second = buildTranslation(groupB.id, { slug: 'stessa-slug' });
      await expect(
        translationRepository.add(second, parentB.id),
      ).resolves.toBeUndefined();
    });

    it('add() rejects a second translation in the same group with an already-used locale with PageTranslationLocaleAlreadyExistsError', async () => {
      const group = buildGroup();
      await groupRepository.add(group);
      const first = buildTranslation(group.id, { locale: 'it' });
      await translationRepository.add(first, null);

      const second = buildTranslation(group.id, { locale: 'it' });
      await expect(translationRepository.add(second, null)).rejects.toThrow(
        PageTranslationLocaleAlreadyExistsError,
      );
    });

    it('publishing from a copy read before an autosave keeps what the autosave wrote', async () => {
      const group = buildGroup();
      await groupRepository.add(group);
      const translation = buildTranslation(group.id);
      await translationRepository.add(translation, null);
      // The publish reads first, then an autosave lands, then the publish writes.
      const publishing = await translationRepository.findById(
        tenantAId,
        translation.id,
      );
      translation.saveFieldValues(
        { 'hero-1': { title: 'Scritto un attimo fa' } },
        { by: userAId },
      );
      await translationRepository.saveContent(
        translation,
        translation.toVersion(randomUUID()),
      );
      publishing?.publish([], { by: userAId });
      if (publishing) await translationRepository.publish(publishing);

      const found = await translationRepository.findById(
        tenantAId,
        translation.id,
      );
      expect(found?.status).toBe('published');
      expect(found?.fieldValues).toEqual({
        'hero-1': { title: 'Scritto un attimo fa' },
      });
    });

    it('never brings a deleted translation back when a save arrives after the delete', async () => {
      const group = buildGroup();
      await groupRepository.add(group);
      const translation = buildTranslation(group.id);
      await translationRepository.add(translation, null);
      await translationRepository.delete(tenantAId, translation.id);

      translation.saveFieldValues(
        { 'hero-1': { title: 'tardi' } },
        { by: null },
      );
      await expect(
        translationRepository.saveContent(
          translation,
          translation.toVersion(randomUUID()),
        ),
      ).rejects.toBeInstanceOf(PageTranslationNotFoundError);
      expect(
        await translationRepository.findById(tenantAId, translation.id),
      ).toBeNull();
    });

    describe('saveContent', () => {
      it("saves the translation's text and its version together", async () => {
        const group = buildGroup();
        await groupRepository.add(group);
        const translation = buildTranslation(group.id, {
          fieldValues: { 'hero-1': { title: 'v1' } },
        });
        const versionId = randomUUID();
        await translationRepository.add(translation, null);

        await translationRepository.saveContent(translation, {
          id: versionId,
          tenantId: tenantAId,
          pageTranslationId: translation.id,
          fieldValues: translation.fieldValues,
          seoMeta: translation.seoMeta,
          divergedContent: null,
          createdBy: null,
          createdAt: translation.updatedAt,
        });

        const foundTranslation = await translationRepository.findById(
          tenantAId,
          translation.id,
        );
        expect(foundTranslation?.id).toBe(translation.id);
        const versions = await translationVersionRepository.listByTranslation(
          tenantAId,
          translation.id,
        );
        expect(versions.map((v) => v.id)).toEqual([versionId]);
      });

      it("keeps an unlinked language's own tree in its version", async () => {
        const group = buildGroup();
        await groupRepository.add(group);
        const translation = buildTranslation(group.id);
        const fork = [
          { id: 'hero-1', type: 'Hero', props: { title: 'Solo qui' } },
        ];
        await translationRepository.add(translation, null);
        translation.diverge(fork, { by: null });

        await translationRepository.saveContent(
          translation,
          translation.toVersion(randomUUID()),
        );

        const [version] = await translationVersionRepository.listByTranslation(
          tenantAId,
          translation.id,
        );
        expect(version.divergedContent).toEqual(fork);
      });

      it('prunes to the last 10 versions per translation, oldest first', async () => {
        const group = buildGroup();
        await groupRepository.add(group);
        const translation = buildTranslation(group.id);
        await translationRepository.add(translation, null);

        const versionIds: string[] = [];
        for (let i = 0; i < 11; i++) {
          const id = randomUUID();
          versionIds.push(id);
          await translationRepository.saveContent(translation, {
            id,
            tenantId: tenantAId,
            pageTranslationId: translation.id,
            fieldValues: { 'hero-1': { title: `v${i}` } },
            seoMeta: translation.seoMeta,
            divergedContent: null,
            createdBy: null,
            createdAt: new Date(Date.now() - (11 - i) * 1000),
          });
        }

        const versions = await translationVersionRepository.listByTranslation(
          tenantAId,
          translation.id,
        );
        expect(versions).toHaveLength(10);
        expect(versions.map((v) => v.id)).toEqual(versionIds.slice(1));
      });
    });
  });
});
