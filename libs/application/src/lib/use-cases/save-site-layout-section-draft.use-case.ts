import { randomUUID } from 'node:crypto';
import {
  SiteLayoutSection,
  SiteLayoutSectionNotFoundError,
} from '@kometio/domain-core';
import type { PageContent } from '@kometio/shared-types';
import type {
  SiteLayoutSectionRepositoryPort,
  SiteLayoutSectionVersionRepositoryPort,
} from '@kometio/ports';

export interface SaveSiteLayoutSectionDraftDeps {
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
  siteLayoutSectionVersionRepository: SiteLayoutSectionVersionRepositoryPort;
}

export interface SaveSiteLayoutSectionDraftInput {
  tenantId: string;
  id: string;
  content: PageContent;
  actorUserId: string | null;
}

export async function saveSiteLayoutSectionDraft(
  deps: SaveSiteLayoutSectionDraftDeps,
  input: SaveSiteLayoutSectionDraftInput,
): Promise<SiteLayoutSection> {
  const section = await deps.siteLayoutSectionRepository.findById(
    input.tenantId,
    input.id,
  );
  if (!section) {
    throw new SiteLayoutSectionNotFoundError(input.id);
  }

  section.saveDraft(input.content);
  await deps.siteLayoutSectionRepository.save(section);
  await deps.siteLayoutSectionVersionRepository.save({
    id: randomUUID(),
    tenantId: section.tenantId,
    siteLayoutSectionId: section.id,
    content: section.content,
    createdBy: input.actorUserId,
    createdAt: section.updatedAt,
  });

  return section;
}
