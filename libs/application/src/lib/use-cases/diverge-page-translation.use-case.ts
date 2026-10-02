import { randomUUID } from 'node:crypto';
import {
  PageGroupNotFoundError,
  PageTranslationDivergedError,
  PageTranslationNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import { mergeTranslatedContent } from '@kometio/shared-types';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';

export interface DivergePageTranslationDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface DivergePageTranslationInput {
  tenantId: string;
  pageTranslationId: string;
  actorUserId: string | null;
}

/**
 * The "scollega" action — forks the current merge (group structure + this
 * locale's fieldValues) into a standalone `divergedContent`. After this,
 * structural edits to PageGroup.content no longer reach this translation,
 * until relinkPageTranslation brings it back (docs/adr/0075).
 */
export async function divergePageTranslation(
  deps: DivergePageTranslationDeps,
  input: DivergePageTranslationInput,
): Promise<PageTranslation> {
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }
  if (translation.isDiverged) {
    throw new PageTranslationDivergedError(translation.id);
  }

  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    translation.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(translation.pageGroupId);
  }

  const merged = mergeTranslatedContent(group.content, translation.fieldValues);
  translation.diverge(merged, { by: input.actorUserId });

  await deps.pageTranslationRepository.saveContent(
    translation,
    translation.toVersion(randomUUID()),
  );

  return translation;
}
