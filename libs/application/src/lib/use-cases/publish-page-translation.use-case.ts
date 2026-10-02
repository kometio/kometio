import {
  PageGroupNotFoundError,
  PageTranslationNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  SearchPort,
} from '@kometio/ports';
import { resolveSectionInstancesIn } from './resolve-section-instances';

export interface PublishPageTranslationDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
  searchPort: SearchPort;
}

export interface PublishPageTranslationInput {
  tenantId: string;
  pageTranslationId: string;
  /** Recorded as the page's last editor — see EditContext in @kometio/domain-core. */
  actorUserId: string | null;
}

/**
 * Freezes this locale's current draft (group structure + fieldValues, or
 * divergedContent when isDiverged) as `publishedSnapshot` — same shape as
 * the old Page.publishedContent, same consumer (public resolution, Fase 2).
 * Also (re)indexes the translation for search — same point in the old
 * publishPage's lifecycle (see publishPage's own history), just against
 * SearchPort's PageTranslation-shaped indexPage (Fase 5).
 */
export async function publishPageTranslation(
  deps: PublishPageTranslationDeps,
  input: PublishPageTranslationInput,
): Promise<PageTranslation> {
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }

  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    translation.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(translation.pageGroupId);
  }

  const merged = translation.currentContent(group.content);

  translation.publish(merged, { by: input.actorUserId });
  await deps.pageTranslationRepository.publish(translation);
  // Sections expanded first: the snapshot holds a reference where their
  // words are, so indexing it as-is would leave a page's section text
  // unsearchable (docs/adr/0059). The snapshot itself keeps the
  // reference — that is what lets publishing the section alone update
  // every page using it.
  const indexable = await resolveSectionInstancesIn(
    deps,
    input.tenantId,
    merged,
  );
  await deps.searchPort.indexPage(
    input.tenantId,
    translation.siteId,
    translation,
    indexable,
  );

  return translation;
}
