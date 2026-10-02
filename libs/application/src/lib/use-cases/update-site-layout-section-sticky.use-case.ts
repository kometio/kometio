import {
  SiteLayoutSection,
  SiteLayoutSectionNotFoundError,
} from '@kometio/domain-core';
import type { SiteLayoutSectionRepositoryPort } from '@kometio/ports';

export interface UpdateSiteLayoutSectionStickyDeps {
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
}

export interface UpdateSiteLayoutSectionStickyInput {
  tenantId: string;
  id: string;
  sticky: boolean;
}

/**
 * A separate use-case from saveSiteLayoutSectionDraft on purpose: `sticky`
 * is a display setting, not content — it takes effect immediately (no
 * draft/publish staging) and never creates a site_layout_section_versions
 * row (there is nothing there an editor would want to roll back to).
 */
export async function updateSiteLayoutSectionSticky(
  deps: UpdateSiteLayoutSectionStickyDeps,
  input: UpdateSiteLayoutSectionStickyInput,
): Promise<SiteLayoutSection> {
  const section = await deps.siteLayoutSectionRepository.findById(
    input.tenantId,
    input.id,
  );
  if (!section) {
    throw new SiteLayoutSectionNotFoundError(input.id);
  }

  section.setSticky(input.sticky);
  await deps.siteLayoutSectionRepository.save(section);

  return section;
}
