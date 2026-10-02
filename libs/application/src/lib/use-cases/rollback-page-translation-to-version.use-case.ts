import { randomUUID } from 'node:crypto';
import {
  PageGroupNotFoundError,
  PageTranslationNotFoundError,
  PageTranslationVersionNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  PageTranslationVersionRepositoryPort,
} from '@kometio/ports';

export interface RollbackPageTranslationToVersionDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  pageTranslationVersionRepository: PageTranslationVersionRepositoryPort;
}

export interface RollbackPageTranslationToVersionInput {
  tenantId: string;
  pageTranslationId: string;
  versionId: string;
  actorUserId: string | null;
}

/**
 * Puts one language's content back the way a version holds it — the
 * history of an unlinked language, which until docs/adr/0075 had none.
 *
 * A version taken while the language was unlinked unlinks it again with
 * that tree; one taken while it was linked relinks it with that text. The
 * restore is itself recorded as a new version, never an overwrite of
 * history, and it touches only the draft — the same discipline as
 * rollbackPageGroupToVersion.
 */
export async function rollbackPageTranslationToVersion(
  deps: RollbackPageTranslationToVersionDeps,
  input: RollbackPageTranslationToVersionInput,
): Promise<PageTranslation> {
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }

  const version = await deps.pageTranslationVersionRepository.findById(
    input.tenantId,
    input.versionId,
  );
  if (!version || version.pageTranslationId !== translation.id) {
    throw new PageTranslationVersionNotFoundError(input.versionId);
  }

  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    translation.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(translation.pageGroupId);
  }

  translation.restoreVersion(version, { by: input.actorUserId });
  await deps.pageTranslationRepository.saveContent(
    translation,
    translation.toVersion(randomUUID()),
  );

  return translation;
}
