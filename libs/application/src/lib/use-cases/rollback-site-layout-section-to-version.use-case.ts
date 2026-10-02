import { randomUUID } from 'node:crypto';
import {
  SiteLayoutSection,
  SiteLayoutSectionNotFoundError,
  SiteLayoutSectionVersionNotFoundError,
} from '@kometio/domain-core';
import type {
  SiteLayoutSectionRepositoryPort,
  SiteLayoutSectionVersionRepositoryPort,
} from '@kometio/ports';

export interface RollbackSiteLayoutSectionToVersionDeps {
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
  siteLayoutSectionVersionRepository: SiteLayoutSectionVersionRepositoryPort;
}

export interface RollbackSiteLayoutSectionToVersionInput {
  tenantId: string;
  id: string;
  versionId: string;
  actorUserId: string | null;
}

/**
 * Restores the draft to a previous version's content and records the
 * rollback itself as a new version (never a destructive overwrite). It does
 * not republish: see SiteLayoutSection.restoreContent().
 */
export async function rollbackSiteLayoutSectionToVersion(
  deps: RollbackSiteLayoutSectionToVersionDeps,
  input: RollbackSiteLayoutSectionToVersionInput,
): Promise<SiteLayoutSection> {
  const section = await deps.siteLayoutSectionRepository.findById(
    input.tenantId,
    input.id,
  );
  if (!section) {
    throw new SiteLayoutSectionNotFoundError(input.id);
  }

  const version = await deps.siteLayoutSectionVersionRepository.findById(
    input.tenantId,
    input.versionId,
  );
  if (!version || version.siteLayoutSectionId !== section.id) {
    throw new SiteLayoutSectionVersionNotFoundError(input.versionId);
  }

  section.restoreContent(version.content);
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
