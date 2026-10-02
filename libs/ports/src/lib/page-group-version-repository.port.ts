import type { PageGroupVersion } from '@kometio/domain-core';

export interface PageGroupVersionRepositoryPort {
  save(version: PageGroupVersion): Promise<void>;
  findById(
    tenantId: string,
    versionId: string,
  ): Promise<PageGroupVersion | null>;
  listByGroup(
    tenantId: string,
    pageGroupId: string,
  ): Promise<PageGroupVersion[]>;
}
