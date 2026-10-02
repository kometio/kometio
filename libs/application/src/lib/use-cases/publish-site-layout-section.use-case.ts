import {
  SiteLayoutSection,
  SiteLayoutSectionNotFoundError,
} from '@kometio/domain-core';
import type { SiteLayoutSectionRepositoryPort } from '@kometio/ports';

export interface PublishSiteLayoutSectionDeps {
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
}

export interface PublishSiteLayoutSectionInput {
  tenantId: string;
  id: string;
}

export async function publishSiteLayoutSection(
  deps: PublishSiteLayoutSectionDeps,
  input: PublishSiteLayoutSectionInput,
): Promise<SiteLayoutSection> {
  const section = await deps.siteLayoutSectionRepository.findById(
    input.tenantId,
    input.id,
  );
  if (!section) {
    throw new SiteLayoutSectionNotFoundError(input.id);
  }

  section.publish();
  await deps.siteLayoutSectionRepository.save(section);

  return section;
}
