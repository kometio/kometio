import {
  SiteLayoutSectionNotFoundError,
  type SiteLayoutSection,
} from '@kometio/domain-core';
import type { SiteLayoutSectionRepositoryPort } from '@kometio/ports';

/** One header or footer by id, within this tenant. */
export async function getSiteLayoutSection(
  deps: { siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort },
  input: { tenantId: string; sectionId: string },
): Promise<SiteLayoutSection> {
  const section = await deps.siteLayoutSectionRepository.findById(
    input.tenantId,
    input.sectionId,
  );
  if (!section) throw new SiteLayoutSectionNotFoundError(input.sectionId);
  return section;
}
