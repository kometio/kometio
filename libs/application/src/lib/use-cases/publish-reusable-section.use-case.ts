import {
  ReusableSection,
  ReusableSectionNotFoundError,
} from '@kometio/domain-core';
import { collectSectionReferences } from '@kometio/shared-types';
import type {
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  SearchPort,
} from '@kometio/ports';
import { resolveSectionInstancesIn } from './resolve-section-instances';

export interface PublishReusableSectionDeps {
  reusableSectionRepository: ReusableSectionRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  searchPort: SearchPort;
}

export interface PublishReusableSectionInput {
  tenantId: string;
  id: string;
}

/**
 * Promotes the draft, then re-indexes every published page that uses the
 * section.
 *
 * The re-index is not housekeeping, it is half the feature. Search indexes
 * a page from its published snapshot, and that snapshot holds a REFERENCE
 * where the section's words are — so the words of a section reach the
 * index only through this resolution. Without this step, publishing a
 * section would change what eight pages show and leave the search index
 * describing what they showed before, silently and for as long as nobody
 * republished them by hand.
 *
 * Sequential rather than `Promise.all`: this runs on a person clicking
 * Publish, not on a request, and firing an unbounded fan-out of writes at
 * the connection pool to save a second of a background task is the wrong
 * trade. A page that fails to re-index does not roll back the publish —
 * the section IS published at that point, and a stale search entry is a
 * much smaller problem than a section that reports failure while being
 * live everywhere.
 */
export async function publishReusableSection(
  deps: PublishReusableSectionDeps,
  input: PublishReusableSectionInput,
): Promise<ReusableSection> {
  const section = await deps.reusableSectionRepository.findById(
    input.tenantId,
    input.id,
  );
  if (!section) {
    throw new ReusableSectionNotFoundError(input.id);
  }

  section.publish();
  await deps.reusableSectionRepository.save(section);

  const published = await deps.pageTranslationRepository.listPublishedBySite(
    input.tenantId,
    section.siteId,
  );
  for (const translation of published) {
    const snapshot = translation.publishedSnapshot;
    if (!snapshot || !collectSectionReferences([snapshot]).has(section.id)) {
      continue;
    }
    const resolved = await resolveSectionInstancesIn(
      deps,
      input.tenantId,
      snapshot,
    );
    await deps.searchPort.indexPage(
      input.tenantId,
      translation.siteId,
      translation,
      resolved,
    );
  }

  return section;
}
