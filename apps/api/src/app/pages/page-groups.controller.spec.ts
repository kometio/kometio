import {
  NotAPageTemplateError,
  PageGroupNotFoundError,
  PageGroupReorderMismatchError,
  PageGroupVersionNotFoundError,
  ReusableSection,
} from '@kometio/domain-core';
import type { ReusableSectionKind } from '@kometio/shared-types';
import type {
  PageGroupRepositoryPort,
  PageGroupSummary,
  PageGroupVersionRepositoryPort,
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
} from '@kometio/ports';
import { buildPageGroup, buildPageTranslation } from '@kometio/testing';

import type { PageGroupsController } from './page-groups.controller';
import { setUpPages } from './pages.test-fixture';

describe('PageGroupsController (unit)', () => {
  let pageGroupRepository: jest.Mocked<PageGroupRepositoryPort>;
  let pageGroupVersionRepository: jest.Mocked<PageGroupVersionRepositoryPort>;
  let pageTranslationRepository: jest.Mocked<PageTranslationRepositoryPort>;
  let reusableSectionRepository: jest.Mocked<ReusableSectionRepositoryPort>;
  let controller: PageGroupsController;

  beforeEach(() => {
    ({
      pageGroupRepository,
      pageGroupVersionRepository,
      pageTranslationRepository,
      reusableSectionRepository,
      groupsController: controller,
    } = setUpPages());
  });

  it('list threads pagination and every filter through to the repository', async () => {
    pageGroupRepository.listBySiteFiltered.mockResolvedValue({
      items: [],
      total: 0,
    });

    await controller.list('tenant-1', {
      siteId: 'site-1',
      page: 2,
      pageSize: 10,
      search: 'chi siamo',
      createdAfter: new Date('2026-01-01'),
      createdBefore: new Date('2026-02-01'),
      createdBy: 'user-1',
      locale: 'it',
    });

    expect(pageGroupRepository.listBySiteFiltered).toHaveBeenCalledWith(
      'tenant-1',
      'site-1',
      { page: 2, pageSize: 10 },
      {
        search: 'chi siamo',
        createdAfter: new Date('2026-01-01'),
        createdBefore: new Date('2026-02-01'),
        createdBy: 'user-1',
        locale: 'it',
      },
      'tree',
    );
  });

  it('a section of the editor comes back as a feed, the site tree in its own order', async () => {
    pageGroupRepository.listBySiteFiltered.mockResolvedValue({
      items: [],
      total: 0,
    });

    await controller.list('tenant-1', {
      siteId: 'site-1',
      page: 1,
      pageSize: 10,
      collection: 'collection-1',
    });

    expect(pageGroupRepository.listBySiteFiltered).toHaveBeenCalledWith(
      'tenant-1',
      'site-1',
      { page: 1, pageSize: 10 },
      expect.objectContaining({ collectionId: 'collection-1' }),
      'newest',
    );
  });

  it('the Pages screen asks for the pages that belong to no section', async () => {
    pageGroupRepository.listBySiteFiltered.mockResolvedValue({
      items: [],
      total: 0,
    });

    await controller.list('tenant-1', {
      siteId: 'site-1',
      page: 1,
      pageSize: 10,
      collection: 'none',
    });

    expect(pageGroupRepository.listBySiteFiltered).toHaveBeenCalledWith(
      'tenant-1',
      'site-1',
      { page: 1, pageSize: 10 },
      expect.objectContaining({ collectionId: null }),
      'tree',
    );
  });

  it('list returns one row per group with its translations', async () => {
    const createdAt = new Date();
    pageGroupRepository.listBySiteFiltered.mockResolvedValue({
      items: [
        {
          id: 'group-1',
          tenantId: 'tenant-1',
          siteId: 'site-1',
          parentId: null,
          order: 0,
          collectionId: null,
          createdBy: 'user-1',
          createdByName: 'Ada Lovelace',
          createdAt,
          updatedAt: createdAt,
          lastEditedAt: createdAt,
          lastEditedByName: 'Ada Lovelace',
          childCount: 2,
          translations: [
            {
              locale: 'it',
              slug: 'home',
              title: 'Home',
              status: 'published',
              isDiverged: false,
              hasUnpublishedChanges: false,
            },
          ],
        },
      ],
      total: 1,
    });

    const result = await controller.list('tenant-1', {
      siteId: 'site-1',
      page: 1,
      pageSize: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'group-1',
      createdByName: 'Ada Lovelace',
      childCount: 2,
      translations: [
        {
          locale: 'it',
          slug: 'home',
          title: 'Home',
          status: 'published',
          isDiverged: false,
        },
      ],
    });
  });

  it('rollback restores the group content from a version belonging to it', async () => {
    const group = buildPageGroup({
      content: [{ id: 'block-1', type: 'Hero', props: { title: 'Current' } }],
    });
    pageGroupRepository.findById.mockResolvedValue(group);
    pageGroupVersionRepository.findById.mockResolvedValue({
      id: 'version-1',
      tenantId: 'tenant-1',
      pageGroupId: 'group-1',
      content: [{ id: 'block-1', type: 'Hero', props: { title: 'Old' } }],
      createdBy: null,
      createdAt: new Date(),
    });

    const result = await controller.rollback('tenant-1', 'user-1', 'group-1', {
      versionId: 'version-1',
    });

    expect(result.content).toEqual([
      { id: 'block-1', type: 'Hero', props: { title: 'Old' } },
    ]);
    expect(pageGroupRepository.saveContent).toHaveBeenCalled();
  });

  it('rollback propagates PageGroupVersionNotFoundError for a version belonging to another group, unwrapped', async () => {
    pageGroupRepository.findById.mockResolvedValue(buildPageGroup());
    pageGroupVersionRepository.findById.mockResolvedValue({
      id: 'version-1',
      tenantId: 'tenant-1',
      pageGroupId: 'some-other-group',
      content: [],
      createdBy: null,
      createdAt: new Date(),
    });

    await expect(
      controller.rollback('tenant-1', 'user-1', 'group-1', {
        versionId: 'version-1',
      }),
    ).rejects.toThrow(PageGroupVersionNotFoundError);
  });

  function buildSummary(
    overrides: Partial<PageGroupSummary> = {},
  ): PageGroupSummary {
    return {
      id: 'group-1',
      tenantId: 'tenant-1',
      siteId: 'site-1',
      parentId: null,
      order: 0,
      collectionId: null,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('reorder threads siteId/parentId/orderedPageGroupIds through to the use-case', async () => {
    pageGroupRepository.listSiblings.mockResolvedValue([
      buildSummary({ id: 'a' }),
      buildSummary({ id: 'b' }),
    ]);

    await controller.reorder('tenant-1', 'user-1', {
      siteId: 'site-1',
      parentId: null,
      orderedPageGroupIds: ['b', 'a'],
    });

    expect(pageGroupRepository.listSiblings).toHaveBeenCalledWith(
      'tenant-1',
      'site-1',
      null,
    );
  });

  it('reorder propagates PageGroupReorderMismatchError, unwrapped', async () => {
    pageGroupRepository.listSiblings.mockResolvedValue([buildSummary()]);

    await expect(
      controller.reorder('tenant-1', 'user-1', {
        siteId: 'site-1',
        parentId: null,
        orderedPageGroupIds: ['not-a-real-sibling'],
      }),
    ).rejects.toThrow(PageGroupReorderMismatchError);
  });

  it('duplicate copies the source group and every translation', async () => {
    const source = buildPageGroup({
      content: [{ id: 'block-1', type: 'Hero', props: { title: 'Hello' } }],
    });
    pageGroupRepository.findById.mockResolvedValue(source);
    pageGroupRepository.listSiblings.mockResolvedValue([]);
    pageTranslationRepository.listByGroup.mockResolvedValue([
      buildPageTranslation({ locale: 'en', slug: 'home' }),
    ]);
    pageTranslationRepository.findByParentGroupAndLocaleSlug.mockResolvedValue(
      null,
    );

    const result = await controller.duplicate('tenant-1', 'user-1', 'group-1');

    expect(result.content).toEqual(source.content);
    expect(pageTranslationRepository.add).toHaveBeenCalled();
  });

  it('duplicate propagates PageGroupNotFoundError, unwrapped', async () => {
    pageGroupRepository.findById.mockResolvedValue(null);

    await expect(
      controller.duplicate('tenant-1', 'user-1', 'missing-id'),
    ).rejects.toThrow(PageGroupNotFoundError);
  });

  it('delete propagates PageGroupNotFoundError, unwrapped', async () => {
    pageGroupRepository.findById.mockResolvedValue(null);

    await expect(
      controller.delete('tenant-1', 'user-1', 'missing-id'),
    ).rejects.toThrow(PageGroupNotFoundError);
  });

  it('delete calls the repository once the group is found', async () => {
    pageGroupRepository.findById.mockResolvedValue(buildPageGroup());
    // No subpages to move up first.
    pageGroupRepository.listSiblings.mockResolvedValue([]);

    await controller.delete('tenant-1', 'user-1', 'group-1');

    expect(pageGroupRepository.delete).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
    );
  });

  it('findById propagates PageGroupNotFoundError, unwrapped', async () => {
    pageGroupRepository.findById.mockResolvedValue(null);

    await expect(controller.findById('tenant-1', 'missing-id')).rejects.toThrow(
      PageGroupNotFoundError,
    );
  });

  it('saveContent propagates PageGroupNotFoundError, unwrapped', async () => {
    pageGroupRepository.findById.mockResolvedValue(null);

    await expect(
      controller.saveContent('tenant-1', 'user-1', 'missing-id', {
        content: [],
      }),
    ).rejects.toThrow(PageGroupNotFoundError);
  });

  describe('templates', () => {
    function buildTemplate(kind: ReusableSectionKind) {
      const section = ReusableSection.create({
        id: 'template-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        name: 'Service page',
        kind,
        content: [{ id: 'hero-1', type: 'Hero', props: { title: 'Hi' } }],
      });
      section.publish();
      return section;
    }

    const firstTranslation = {
      locale: 'en',
      slug: 'plumber',
      seoMeta: { title: 'Plumber', description: '' },
    };

    it('create with a template writes the copied page and its first language in one save', async () => {
      reusableSectionRepository.findById.mockResolvedValue(
        buildTemplate('template'),
      );
      pageGroupRepository.listSiblings.mockResolvedValue([]);
      pageTranslationRepository.findByParentGroupAndLocaleSlug.mockResolvedValue(
        null,
      );

      const result = await controller.create('tenant-1', 'user-1', {
        siteId: 'site-1',
        templateId: 'template-1',
        translation: firstTranslation,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].props).toEqual({ title: 'Hi' });
      expect(result.content[0].id).not.toBe('hero-1');
      expect(pageGroupRepository.addWithTranslation).toHaveBeenCalledTimes(1);
      const [, , translation] =
        pageGroupRepository.addWithTranslation.mock.calls[0];
      expect(translation.slug).toBe('plumber');
      expect(pageGroupRepository.addWithVersion).not.toHaveBeenCalled();
    });

    it('create without a translation still creates the group alone, reading no section', async () => {
      pageGroupRepository.listSiblings.mockResolvedValue([]);

      await controller.create('tenant-1', 'user-1', { siteId: 'site-1' });

      expect(pageGroupRepository.addWithVersion).toHaveBeenCalledTimes(1);
      expect(reusableSectionRepository.findById).not.toHaveBeenCalled();
    });

    it('create propagates NotAPageTemplateError for a shared section, unwrapped, and writes nothing', async () => {
      reusableSectionRepository.findById.mockResolvedValue(
        buildTemplate('shared'),
      );

      await expect(
        controller.create('tenant-1', 'user-1', {
          siteId: 'site-1',
          templateId: 'template-1',
          translation: firstTranslation,
        }),
      ).rejects.toThrow(NotAPageTemplateError);
      expect(pageGroupRepository.addWithTranslation).not.toHaveBeenCalled();
    });

    it('saveAsTemplate propagates PageGroupNotFoundError, unwrapped', async () => {
      pageGroupRepository.findById.mockResolvedValue(null);

      await expect(
        controller.saveAsTemplate('tenant-1', 'user-1', 'missing', {
          name: 'Service page',
        }),
      ).rejects.toThrow(PageGroupNotFoundError);
      expect(reusableSectionRepository.save).not.toHaveBeenCalled();
    });
  });

  it('lets unexpected errors propagate unchanged', async () => {
    pageGroupRepository.findById.mockResolvedValue(buildPageGroup());
    pageGroupRepository.saveContent.mockRejectedValue(new Error('db exploded'));

    await expect(
      controller.saveContent('tenant-1', 'user-1', 'group-1', { content: [] }),
    ).rejects.toThrow('db exploded');
  });
});
