import { randomUUID } from 'node:crypto';
import {
  PageGroupNotFoundError,
  PageTranslation,
  PageTranslationDivergedError,
  PageTranslationNotFoundError,
} from '@kometio/domain-core';
import type { FieldValueOverlay } from '@kometio/shared-types';
import type {
  ContentSanitizerPort,
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';

export interface SavePageTranslationFieldValuesDeps {
  pageTranslationRepository: PageTranslationRepositoryPort;
  /** To read the page's tree, which says what type each block in the overlay is. */
  pageGroupRepository: PageGroupRepositoryPort;
  contentSanitizer: ContentSanitizerPort;
}

export interface SavePageTranslationFieldValuesInput {
  tenantId: string;
  pageTranslationId: string;
  fieldValues: FieldValueOverlay;
  actorUserId: string | null;
}

/**
 * Saves the per-locale text overlay — mirrors saveDraft's versioning
 * discipline (one PageTranslationVersion row per save). A diverged
 * translation ignores `fieldValues` entirely (see PageTranslation.
 * saveFieldValues's own doc comment), so writing here would silently do
 * nothing from the caller's point of view — rejected instead, the caller
 * must use the diverged-content path (Fase 3).
 *
 * The overlay is made safe to render before it is kept, against the tree of
 * the group the translation belongs to — found through the translation,
 * never through an id in the request: the body's `parentGroupId` is the
 * group's parent in the page HIERARCHY, and cleaning against it would mean
 * cleaning against another page's tree. A translation whose group is gone
 * is refused; the value would have been kept as typed.
 */
export async function savePageTranslationFieldValues(
  deps: SavePageTranslationFieldValuesDeps,
  input: SavePageTranslationFieldValuesInput,
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

  translation.saveFieldValues(
    deps.contentSanitizer.sanitizeFieldValueOverlay(
      input.fieldValues,
      group.content,
    ),
    {
      by: input.actorUserId,
    },
  );
  await deps.pageTranslationRepository.saveContent(
    translation,
    translation.toVersion(randomUUID()),
  );

  return translation;
}
