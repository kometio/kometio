import type { ReusableSectionVersion } from '@kometio/domain-core';

export interface ReusableSectionVersionRepositoryPort {
  save(version: ReusableSectionVersion): Promise<void>;
  findById(
    tenantId: string,
    versionId: string,
  ): Promise<ReusableSectionVersion | null>;
  listBySection(
    tenantId: string,
    reusableSectionId: string,
  ): Promise<ReusableSectionVersion[]>;
}
