import {
  PageGroupNotFoundError,
  PageTranslationDivergedError,
  PageTranslationLocaleAlreadyExistsError,
  PageTranslationNotDivergedError,
  PageTranslationNotFoundError,
} from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  PreviewTokenPort,
} from '@kometio/ports';
import { buildPageGroup, buildPageTranslation } from '@kometio/testing';

import type { PageTranslationsController } from './page-translations.controller';
import { setUpPages } from './pages.test-fixture';

describe('PageTranslationsController (unit)', () => {
  let pageGroupRepository: jest.Mocked<PageGroupRepositoryPort>;
  let pageTranslationRepository: jest.Mocked<PageTranslationRepositoryPort>;
  let previewTokenPort: jest.Mocked<PreviewTokenPort>;
  let controller: PageTranslationsController;

  beforeEach(() => {
    ({
      pageGroupRepository,
      pageTranslationRepository,
      previewTokenPort,
      translationsController: controller,
    } = setUpPages());
  });

  it('createTranslation propagates PageGroupNotFoundError, unwrapped', async () => {
    pageGroupRepository.findById.mockResolvedValue(null);

    await expect(
      controller.createTranslation('tenant-1', 'user-1', 'missing-id', {
        locale: 'en',
        slug: 'home',
        seoMeta: { title: 'Home', description: '' },
      }),
    ).rejects.toThrow(PageGroupNotFoundError);
  });

  it('createTranslation propagates PageTranslationLocaleAlreadyExistsError, unwrapped', async () => {
    pageGroupRepository.findById.mockResolvedValue(buildPageGroup());
    pageTranslationRepository.findByGroupAndLocale.mockResolvedValue(
      buildPageTranslation(),
    );

    await expect(
      controller.createTranslation('tenant-1', 'user-1', 'group-1', {
        locale: 'en',
        slug: 'home-2',
        seoMeta: { title: 'Home', description: '' },
      }),
    ).rejects.toThrow(PageTranslationLocaleAlreadyExistsError);
  });

  it('saveFieldValues propagates PageTranslationNotFoundError, unwrapped', async () => {
    pageTranslationRepository.findById.mockResolvedValue(null);

    await expect(
      controller.saveFieldValues('tenant-1', 'user-1', 'missing-id', {
        fieldValues: {},
      }),
    ).rejects.toThrow(PageTranslationNotFoundError);
  });

  it('saveFieldValues propagates PageTranslationDivergedError once diverged, unwrapped', async () => {
    const diverged = buildPageTranslation();
    diverged.diverge([], { by: null });
    pageTranslationRepository.findById.mockResolvedValue(diverged);

    await expect(
      controller.saveFieldValues('tenant-1', 'user-1', 'translation-1', {
        fieldValues: {},
      }),
    ).rejects.toThrow(PageTranslationDivergedError);
  });

  it('saveDivergedContent propagates PageTranslationNotDivergedError on a still-linked translation, unwrapped', async () => {
    pageTranslationRepository.findById.mockResolvedValue(
      buildPageTranslation(),
    );

    await expect(
      controller.saveDivergedContent('tenant-1', 'user-1', 'translation-1', {
        content: [],
      }),
    ).rejects.toThrow(PageTranslationNotDivergedError);
  });

  it('saveDivergedContent saves independent content on an already-diverged translation', async () => {
    const diverged = buildPageTranslation();
    diverged.diverge([], { by: null });
    pageTranslationRepository.findById.mockResolvedValue(diverged);

    const result = await controller.saveDivergedContent(
      'tenant-1',
      'user-1',
      'translation-1',
      {
        content: [{ type: 'Text', props: { body: 'x' } }],
      },
    );

    expect(result.divergedContent).toEqual([
      { type: 'Text', props: { body: 'x' } },
    ]);
  });

  it('publish propagates PageTranslationNotFoundError, unwrapped', async () => {
    pageTranslationRepository.findById.mockResolvedValue(null);

    await expect(
      controller.publish('tenant-1', 'user-1', 'missing-id'),
    ).rejects.toThrow(PageTranslationNotFoundError);
  });

  it('publish freezes the merged group+fieldValues content', async () => {
    const group = buildPageGroup({
      content: [{ id: 'block-1', type: 'Hero', props: { title: 'Hello' } }],
    });
    const translation = buildPageTranslation({
      fieldValues: { 'block-1': { title: 'Ciao' } },
    });
    pageTranslationRepository.findById.mockResolvedValue(translation);
    pageGroupRepository.findById.mockResolvedValue(group);

    const result = await controller.publish(
      'tenant-1',
      'user-1',
      'translation-1',
    );

    expect(result.status).toBe('published');
    expect(result.publishedSnapshot).toEqual([
      { id: 'block-1', type: 'Hero', props: { title: 'Ciao' } },
    ]);
  });

  it('createPreviewToken propagates PageTranslationNotFoundError, unwrapped', async () => {
    pageTranslationRepository.findById.mockResolvedValue(null);

    await expect(
      controller.createPreviewToken('tenant-1', 'missing-id'),
    ).rejects.toThrow(PageTranslationNotFoundError);
    expect(previewTokenPort.createToken).not.toHaveBeenCalled();
  });

  it("createPreviewToken issues a token scoped to (tenant, 'page', translationId)", async () => {
    pageTranslationRepository.findById.mockResolvedValue(
      buildPageTranslation(),
    );
    const expiresAt = new Date();
    previewTokenPort.createToken.mockResolvedValue({
      token: 'opaque-token',
      tenantId: 'tenant-1',
      contentType: 'page',
      contentId: 'translation-1',
      expiresAt,
    });

    const result = await controller.createPreviewToken(
      'tenant-1',
      'translation-1',
    );

    expect(previewTokenPort.createToken).toHaveBeenCalledWith(
      'tenant-1',
      'page',
      'translation-1',
      expect.any(Number),
    );
    expect(result).toEqual({ token: 'opaque-token', expiresAt });
  });

  it('diverge propagates PageTranslationDivergedError if already diverged, unwrapped', async () => {
    const diverged = buildPageTranslation();
    diverged.diverge([], { by: null });
    pageTranslationRepository.findById.mockResolvedValue(diverged);

    await expect(
      controller.diverge('tenant-1', 'user-1', 'translation-1'),
    ).rejects.toThrow(PageTranslationDivergedError);
  });
});
