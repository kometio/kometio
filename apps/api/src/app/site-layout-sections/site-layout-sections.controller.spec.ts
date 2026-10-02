import {
  SiteLayoutSectionNotFoundError,
  SiteLayoutSectionVersionNotFoundError,
  SiteNotFoundError,
} from '@kometio/domain-core';
import type {
  SiteLayoutSectionRepositoryPort,
  SiteLayoutSectionVersionRepositoryPort,
} from '@kometio/ports';
import {
  buildSite,
  buildSiteLayoutSection,
  InMemorySiteRepository,
} from '@kometio/testing';
import { SiteLayoutSectionsController } from './site-layout-sections.controller';

describe('SiteLayoutSectionsController (unit)', () => {
  let siteLayoutSectionRepository: jest.Mocked<SiteLayoutSectionRepositoryPort>;
  let siteLayoutSectionVersionRepository: jest.Mocked<SiteLayoutSectionVersionRepositoryPort>;
  let siteRepository: InMemorySiteRepository;
  let controller: SiteLayoutSectionsController;

  beforeEach(() => {
    siteLayoutSectionRepository = {
      add: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findBySiteLocaleKind: jest.fn(),
    };
    siteLayoutSectionVersionRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      listBySection: jest.fn(),
    };
    siteRepository = new InMemorySiteRepository();
    controller = new SiteLayoutSectionsController({
      siteLayoutSectionRepository,
      siteLayoutSectionVersionRepository,
      siteRepository,
    });
  });

  it('findById throws SiteLayoutSectionNotFoundError (a 404) when no section matches', async () => {
    siteLayoutSectionRepository.findById.mockResolvedValue(null);

    await expect(controller.findById('tenant-1', 'missing-id')).rejects.toThrow(
      SiteLayoutSectionNotFoundError,
    );
  });

  // The mapping to a 404 now happens in the global HttpExceptionFilter
  // (see http-exception.filter.spec.ts), not here — the controller's own
  // contract is just to let the domain error propagate unwrapped.
  it('getOrCreate propagates SiteNotFoundError, unwrapped', async () => {
    await expect(
      controller.getOrCreate('tenant-1', {
        siteId: 'site-1',
        locale: 'it',
        kind: 'header',
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('saveDraft propagates SiteLayoutSectionNotFoundError, unwrapped', async () => {
    siteLayoutSectionRepository.findById.mockResolvedValue(null);

    await expect(
      controller.saveDraft('tenant-1', 'missing-id', { content: [] }),
    ).rejects.toThrow(SiteLayoutSectionNotFoundError);
  });

  it('publish propagates SiteLayoutSectionNotFoundError, unwrapped', async () => {
    siteLayoutSectionRepository.findById.mockResolvedValue(null);

    await expect(controller.publish('tenant-1', 'missing-id')).rejects.toThrow(
      SiteLayoutSectionNotFoundError,
    );
  });

  it('rollback propagates SiteLayoutSectionVersionNotFoundError, unwrapped', async () => {
    const section = buildSiteLayoutSection();
    siteLayoutSectionRepository.findById.mockResolvedValue(section);
    siteLayoutSectionVersionRepository.findById.mockResolvedValue(null);

    await expect(
      controller.rollback('tenant-1', section.id, {
        versionId: 'missing-version',
      }),
    ).rejects.toThrow(SiteLayoutSectionVersionNotFoundError);
  });

  it('lets unexpected errors propagate unchanged', async () => {
    const section = buildSiteLayoutSection();
    siteLayoutSectionRepository.findById.mockResolvedValue(section);
    siteLayoutSectionRepository.save.mockRejectedValue(
      new Error('db exploded'),
    );

    await expect(
      controller.saveDraft('tenant-1', section.id, { content: [] }),
    ).rejects.toThrow('db exploded');
  });

  it('updateSticky propagates SiteLayoutSectionNotFoundError, unwrapped', async () => {
    siteLayoutSectionRepository.findById.mockResolvedValue(null);

    await expect(
      controller.updateSticky('tenant-1', 'missing-id', { sticky: true }),
    ).rejects.toThrow(SiteLayoutSectionNotFoundError);
  });

  it('updateSticky flips the flag and persists it', async () => {
    const section = buildSiteLayoutSection();
    siteLayoutSectionRepository.findById.mockResolvedValue(section);

    const result = await controller.updateSticky('tenant-1', section.id, {
      sticky: true,
    });

    expect(result.sticky).toBe(true);
    expect(siteLayoutSectionRepository.save).toHaveBeenCalledWith(section);
  });

  it('getOrCreate returns the existing section instead of creating a new one', async () => {
    await siteRepository.add(buildSite());
    const existing = buildSiteLayoutSection();
    siteLayoutSectionRepository.findBySiteLocaleKind.mockResolvedValue(
      existing,
    );

    const result = await controller.getOrCreate('tenant-1', {
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });

    expect(result.id).toBe(existing.id);
    expect(siteLayoutSectionRepository.save).not.toHaveBeenCalled();
  });
});
