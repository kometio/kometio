import {
  PageTranslationNotFoundError,
  ReusableSectionNotFoundError,
} from '@kometio/domain-core';
import type {
  PageTranslationRepositoryPort,
  PreviewToken,
  PreviewTokenPort,
  ReusableSectionRepositoryPort,
} from '@kometio/ports';

/**
 * How long a preview link works. A policy of the application, not of the
 * adapter that signs the token (see PreviewTokenPort): an hour covers one
 * continuous editing session, and the editor asks for a fresh link when it
 * is reopened instead of keeping one preview alive for days.
 */
export const PREVIEW_TOKEN_TTL_MS = 1000 * 60 * 60;

/**
 * A link to see one language of a page as it stands, draft included. The
 * translation is looked up first, inside the tenant: a token for a page
 * that is not the tenant's would otherwise be signed for it.
 */
export async function createPagePreviewToken(
  deps: {
    pageTranslationRepository: PageTranslationRepositoryPort;
    previewTokenPort: PreviewTokenPort;
  },
  input: { tenantId: string; pageTranslationId: string },
): Promise<PreviewToken> {
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }
  return deps.previewTokenPort.createToken(
    input.tenantId,
    'page',
    translation.id,
    PREVIEW_TOKEN_TTL_MS,
  );
}

/** The same for a reusable section. */
export async function createSectionPreviewToken(
  deps: {
    reusableSectionRepository: ReusableSectionRepositoryPort;
    previewTokenPort: PreviewTokenPort;
  },
  input: { tenantId: string; sectionId: string },
): Promise<PreviewToken> {
  const section = await deps.reusableSectionRepository.findById(
    input.tenantId,
    input.sectionId,
  );
  if (!section) throw new ReusableSectionNotFoundError(input.sectionId);
  return deps.previewTokenPort.createToken(
    input.tenantId,
    'section',
    section.id,
    PREVIEW_TOKEN_TTL_MS,
  );
}
