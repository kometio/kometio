import { randomUUID } from 'node:crypto';
import {
  PageTranslationNotDivergedError,
  PageTranslationNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import type { PageContent } from '@kometio/shared-types';
import type { PageTranslationRepositoryPort } from '@kometio/ports';

export interface SaveDivergedPageTranslationContentDeps {
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface SaveDivergedPageTranslationContentInput {
  tenantId: string;
  pageTranslationId: string;
  content: PageContent;
  /** Recorded as the page's last editor — see EditContext in @kometio/domain-core. */
  actorUserId: string | null;
}

/**
 * Saves a diverged translation's own, independent structure — the
 * counterpart to savePageGroupContent for a translation that has forked
 * away from the shared PageGroup.content (see PageTranslation.diverge).
 *
 * With a version, like every other content save: the fork used to have no
 * history at all, so the only copy of an unlinked language's work was the
 * row itself, and relinking would have thrown it away for good
 * (docs/adr/0075).
 */
export async function saveDivergedPageTranslationContent(
  deps: SaveDivergedPageTranslationContentDeps,
  input: SaveDivergedPageTranslationContentInput,
): Promise<PageTranslation> {
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }
  if (!translation.isDiverged) {
    throw new PageTranslationNotDivergedError(translation.id);
  }

  translation.saveDivergedContent(input.content, {
    by: input.actorUserId,
  });
  await deps.pageTranslationRepository.saveContent(
    translation,
    translation.toVersion(randomUUID()),
  );

  return translation;
}
