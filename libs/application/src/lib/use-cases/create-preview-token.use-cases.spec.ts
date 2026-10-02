import {
  PageTranslationNotFoundError,
  ReusableSectionNotFoundError,
} from '@kometio/domain-core';
import type { PreviewTokenPort } from '@kometio/ports';
import {
  buildPageTranslation,
  buildReusableSection,
  InMemoryPageTranslationRepository,
  InMemoryReusableSectionRepository,
} from '@kometio/testing';
import { describe, expect, it } from 'vitest';
import {
  createPagePreviewToken,
  createSectionPreviewToken,
  PREVIEW_TOKEN_TTL_MS,
} from './create-preview-token.use-cases';

/** Records what it is asked to sign. */
function recordingTokens() {
  const signed: Parameters<PreviewTokenPort['createToken']>[] = [];
  const previewTokenPort: PreviewTokenPort = {
    createToken: async (tenantId, contentType, contentId, ttlMs) => {
      signed.push([tenantId, contentType, contentId, ttlMs]);
      return {
        token: 'an-opaque-token',
        tenantId,
        contentType,
        contentId,
        expiresAt: new Date('2026-09-30T10:00:00Z'),
      };
    },
    validateToken: async () => null,
  };
  return { previewTokenPort, signed };
}

describe('createPagePreviewToken', () => {
  it("signs a token for the tenant's own translation, for as long as the policy says", async () => {
    const pageTranslationRepository = new InMemoryPageTranslationRepository();
    await pageTranslationRepository.add(buildPageTranslation(), null);
    const { previewTokenPort, signed } = recordingTokens();

    const token = await createPagePreviewToken(
      { pageTranslationRepository, previewTokenPort },
      { tenantId: 'tenant-1', pageTranslationId: 'translation-1' },
    );

    expect(token.token).toBe('an-opaque-token');
    expect(signed).toEqual([
      ['tenant-1', 'page', 'translation-1', PREVIEW_TOKEN_TTL_MS],
    ]);
  });

  it('signs nothing for a translation that is not there, or is another tenant’s', async () => {
    const pageTranslationRepository = new InMemoryPageTranslationRepository();
    await pageTranslationRepository.add(buildPageTranslation(), null);
    const { previewTokenPort, signed } = recordingTokens();

    await expect(
      createPagePreviewToken(
        { pageTranslationRepository, previewTokenPort },
        { tenantId: 'tenant-2', pageTranslationId: 'translation-1' },
      ),
    ).rejects.toBeInstanceOf(PageTranslationNotFoundError);
    await expect(
      createPagePreviewToken(
        { pageTranslationRepository, previewTokenPort },
        { tenantId: 'tenant-1', pageTranslationId: 'missing' },
      ),
    ).rejects.toBeInstanceOf(PageTranslationNotFoundError);
    expect(signed).toEqual([]);
  });
});

describe('createSectionPreviewToken', () => {
  it('signs a token for the tenant’s own section, and refuses one that is not', async () => {
    const reusableSectionRepository = new InMemoryReusableSectionRepository();
    await reusableSectionRepository.add(buildReusableSection());
    const { previewTokenPort, signed } = recordingTokens();
    const deps = { reusableSectionRepository, previewTokenPort };

    await createSectionPreviewToken(deps, {
      tenantId: 'tenant-1',
      sectionId: 'reusable-section-1',
    });
    await expect(
      createSectionPreviewToken(deps, {
        tenantId: 'tenant-2',
        sectionId: 'reusable-section-1',
      }),
    ).rejects.toBeInstanceOf(ReusableSectionNotFoundError);

    expect(signed).toEqual([
      ['tenant-1', 'section', 'reusable-section-1', PREVIEW_TOKEN_TTL_MS],
    ]);
  });
});
