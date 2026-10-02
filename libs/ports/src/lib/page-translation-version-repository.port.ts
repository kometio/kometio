import type { PageTranslationVersion } from '@kometio/domain-core';

export interface PageTranslationVersionRepositoryPort {
  save(version: PageTranslationVersion): Promise<void>;
  findById(
    tenantId: string,
    versionId: string,
  ): Promise<PageTranslationVersion | null>;
  listByTranslation(
    tenantId: string,
    pageTranslationId: string,
  ): Promise<PageTranslationVersion[]>;
}
