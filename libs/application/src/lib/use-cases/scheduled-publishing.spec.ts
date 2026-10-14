import { describe, expect, it } from 'vitest';
import {
  PageTranslationNotFoundError,
  PublishScheduleNotAheadError,
} from '@kometio/domain-core';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemorySearchPort,
  InMemorySiteRepository,
  InMemoryTaxonomyRepository,
  InMemoryCollectionRepository,
  buildCollection,
  buildSite,
} from '@kometio/testing';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { savePageGroupContent } from './save-page-group-content.use-case';
import { publishPageTranslation } from './publish-page-translation.use-case';
import { schedulePageTranslationPublish } from './schedule-page-translation-publish.use-case';
import { cancelPageTranslationSchedule } from './cancel-page-translation-schedule.use-case';
import { publishDuePageTranslations } from './publish-due-page-translations.use-case';

describe('publishing at a time (docs/adr/0135)', () => {
  const tenantId = 'tenant-1';
  const NOW = new Date('2026-11-01T10:00:00.000Z');
  const LATER = new Date('2026-11-02T08:00:00.000Z');

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
      pageTranslationVersionRepository,
      searchPort: new InMemorySearchPort(),
      reusableSectionRepository: new InMemoryReusableSectionRepository(),
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      siteRepository: new InMemorySiteRepository(buildSite({})),
      collectionRepository: new InMemoryCollectionRepository(
        buildCollection({ id: 'news' }),
      ),
    };
  }

  async function aDraft(deps: ReturnType<typeof setup>, slug = 'novita') {
    const group = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      content: [{ id: 'b1', type: 'Text', props: { body: 'prima' } }],
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
    return { group, translation };
  }

  describe('scheduling', () => {
    it('keeps the moment and who asked, and publishes nothing yet', async () => {
      const deps = setup();
      const { translation } = await aDraft(deps);

      const scheduled = await schedulePageTranslationPublish(deps, {
        tenantId,
        pageTranslationId: translation.id,
        publishAt: LATER,
        actorUserId: 'user-2',
        now: NOW,
      });

      expect(scheduled.scheduledPublishAt).toEqual(LATER);
      expect(scheduled.scheduledBy).toBe('user-2');
      expect(scheduled.status).toBe('draft');
      expect(deps.searchPort.indexed).toEqual([]);
    });

    it('refuses a moment that is not ahead: that is "publish", which has its own button', async () => {
      const deps = setup();
      const { translation } = await aDraft(deps);

      await expect(
        schedulePageTranslationPublish(deps, {
          tenantId,
          pageTranslationId: translation.id,
          publishAt: NOW,
          actorUserId: 'user-2',
          now: NOW,
        }),
      ).rejects.toBeInstanceOf(PublishScheduleNotAheadError);
    });

    it('replaces an earlier schedule', async () => {
      const deps = setup();
      const { translation } = await aDraft(deps);
      await schedulePageTranslationPublish(deps, {
        tenantId,
        pageTranslationId: translation.id,
        publishAt: LATER,
        actorUserId: 'user-2',
        now: NOW,
      });
      const later = new Date('2026-12-01T09:00:00.000Z');

      const scheduled = await schedulePageTranslationPublish(deps, {
        tenantId,
        pageTranslationId: translation.id,
        publishAt: later,
        actorUserId: 'user-3',
        now: NOW,
      });

      expect(scheduled.scheduledPublishAt).toEqual(later);
      expect(scheduled.scheduledBy).toBe('user-3');
    });

    it('says when there is no such translation', async () => {
      const deps = setup();

      await expect(
        schedulePageTranslationPublish(deps, {
          tenantId,
          pageTranslationId: 'nope',
          publishAt: LATER,
          actorUserId: 'user-2',
          now: NOW,
        }),
      ).rejects.toBeInstanceOf(PageTranslationNotFoundError);
    });
  });

  describe('cancelling', () => {
    it('takes the schedule back and leaves the draft as it is', async () => {
      const deps = setup();
      const { translation } = await aDraft(deps);
      await schedulePageTranslationPublish(deps, {
        tenantId,
        pageTranslationId: translation.id,
        publishAt: LATER,
        actorUserId: 'user-2',
        now: NOW,
      });

      const cancelled = await cancelPageTranslationSchedule(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-2',
      });

      expect(cancelled.scheduledPublishAt).toBeNull();
      expect(cancelled.status).toBe('draft');
    });
  });

  describe('the tick', () => {
    async function scheduled(
      deps: ReturnType<typeof setup>,
      slug: string,
      at: Date,
      by = 'user-2',
    ) {
      const made = await aDraft(deps, slug);
      await schedulePageTranslationPublish(deps, {
        tenantId,
        pageTranslationId: made.translation.id,
        publishAt: at,
        actorUserId: by,
        now: NOW,
      });
      return made;
    }

    it('publishes what is due, as the person who scheduled it, and clears the schedule', async () => {
      const deps = setup();
      const { translation } = await scheduled(deps, 'novita', LATER);

      const result = await publishDuePageTranslations(deps, {
        tenantId,
        now: new Date(LATER.getTime() + 30_000),
      });

      expect(result).toEqual({ published: 1, failed: 0, notIndexed: 0 });
      const after = await deps.pageTranslationRepository.findById(
        tenantId,
        translation.id,
      );
      expect(after?.status).toBe('published');
      expect(after?.updatedBy).toBe('user-2');
      expect(after?.scheduledPublishAt).toBeNull();
      expect(deps.searchPort.indexed).toHaveLength(1);
    });

    it('leaves alone what is not due yet', async () => {
      const deps = setup();
      const { translation } = await scheduled(deps, 'novita', LATER);

      const result = await publishDuePageTranslations(deps, {
        tenantId,
        now: new Date(LATER.getTime() - 60_000),
      });

      expect(result).toEqual({ published: 0, failed: 0, notIndexed: 0 });
      const after = await deps.pageTranslationRepository.findById(
        tenantId,
        translation.id,
      );
      expect(after?.status).toBe('draft');
      expect(after?.scheduledPublishAt).toEqual(LATER);
    });

    it('publishes the draft as it is then, not as it was when it was scheduled', async () => {
      const deps = setup();
      const { group, translation } = await scheduled(deps, 'novita', LATER);
      await savePageGroupContent(deps, {
        tenantId,
        pageGroupId: group.id,
        content: [{ id: 'b1', type: 'Text', props: { body: 'dopo' } }],
        actorUserId: 'user-1',
      });

      await publishDuePageTranslations(deps, {
        tenantId,
        now: new Date(LATER.getTime() + 1000),
      });

      const after = await deps.pageTranslationRepository.findById(
        tenantId,
        translation.id,
      );
      expect(after?.publishedSnapshot).toEqual([
        { id: 'b1', type: 'Text', props: { body: 'dopo' } },
      ]);
    });

    it('does not publish twice what a person had already published by hand', async () => {
      const deps = setup();
      const { translation } = await scheduled(deps, 'novita', LATER);
      await publishPageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });
      expect(deps.searchPort.indexed).toHaveLength(1);

      const result = await publishDuePageTranslations(deps, {
        tenantId,
        now: new Date(LATER.getTime() + 1000),
      });

      expect(result).toEqual({ published: 0, failed: 0, notIndexed: 0 });
      expect(deps.searchPort.indexed).toHaveLength(1);
    });

    it('records why one failed, keeps it scheduled, and goes on with the others', async () => {
      const deps = setup();
      const first = await scheduled(deps, 'prima', LATER);
      const second = await scheduled(deps, 'seconda', LATER);
      // The database does not answer for the first one it is asked about: the
      // rest must not wait for it. (Before anything is written, as a lost
      // connection is; the in-memory fake shares its entities, so a failure
      // after the write would not look like one.)
      let calls = 0;
      const findGroup = deps.pageGroupRepository.findById.bind(
        deps.pageGroupRepository,
      );
      deps.pageGroupRepository.findById = async (...args) => {
        calls += 1;
        if (calls === 1) throw new Error('the database did not answer');
        return findGroup(...args);
      };

      const result = await publishDuePageTranslations(deps, {
        tenantId,
        now: new Date(LATER.getTime() + 1000),
      });

      expect(result).toEqual({ published: 1, failed: 1, notIndexed: 0 });
      const states = await Promise.all(
        [first, second].map(({ translation }) =>
          deps.pageTranslationRepository.findById(tenantId, translation.id),
        ),
      );
      const failed = states.find((state) => state?.scheduleFailure);
      expect(failed?.status).toBe('draft');
      expect(failed?.scheduledPublishAt).toEqual(LATER);
      expect(failed?.scheduleFailure).toBe('the database did not answer');
      expect(
        states.filter((state) => state?.status === 'published'),
      ).toHaveLength(1);
    });

    it('counts a page as published when only the index failed, and says it was not indexed', async () => {
      const deps = setup();
      const { translation } = await scheduled(deps, 'novita', LATER);
      deps.searchPort.indexPage = async () => {
        throw new Error('the search index did not answer');
      };

      const result = await publishDuePageTranslations(deps, {
        tenantId,
        now: new Date(LATER.getTime() + 1000),
      });

      expect(result).toEqual({ published: 1, failed: 0, notIndexed: 1 });
      const after = await deps.pageTranslationRepository.findById(
        tenantId,
        translation.id,
      );
      expect(after?.status).toBe('published');
      expect(after?.scheduledPublishAt).toBeNull();
    });
  });
});
