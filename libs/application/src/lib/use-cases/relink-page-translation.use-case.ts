import { randomUUID } from 'node:crypto';
import {
  PageGroupNotFoundError,
  PageTranslationNotDivergedError,
  PageTranslationNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import type { FieldValueOverlay } from '@kometio/shared-types';
import type {
  ContentSanitizerPort,
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';

export interface RelinkPageTranslationDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  contentSanitizer: ContentSanitizerPort;
}

export interface RelinkPageTranslationInput {
  tenantId: string;
  pageTranslationId: string;
  /** The fork's text as an overlay on the shared structure — `relinkedOverlay` in @kometio/shared-types, computed by the caller. */
  fieldValues: FieldValueOverlay;
  actorUserId: string | null;
}

/**
 * Brings an unlinked language back onto the shared structure
 * (docs/adr/0075), with the fork's text as its translation, made safe to
 * render against the group's tree before it is kept.
 *
 * The overlay arrives computed rather than computed here: which fields
 * carry over depends on which ones each block declares translatable, and
 * only the editor knows that for every block — a running API knows the
 * core registry and not a theme's (see sanitize-page-content.ts). The
 * editor already needs it anyway, to say how many blocks relinking would
 * drop before anyone confirms.
 *
 * Nothing is lost for good: the fork being let go is the translation's
 * newest version — every change to it is versioned — so restoring that
 * version unlinks the language again with it.
 */
export async function relinkPageTranslation(
  deps: RelinkPageTranslationDeps,
  input: RelinkPageTranslationInput,
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

  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    translation.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(translation.pageGroupId);
  }

  translation.relink(
    deps.contentSanitizer.sanitizeFieldValueOverlay(
      input.fieldValues,
      group.content,
    ),
    { by: input.actorUserId },
  );
  await deps.pageTranslationRepository.saveContent(
    translation,
    translation.toVersion(randomUUID()),
  );

  return translation;
}
