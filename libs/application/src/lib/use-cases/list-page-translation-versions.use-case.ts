import type { PageTranslationVersion } from '@kometio/domain-core';
import type { PageTranslationVersionRepositoryPort } from '@kometio/ports';

export interface ListPageTranslationVersionsDeps {
  pageTranslationVersionRepository: PageTranslationVersionRepositoryPort;
}

export interface ListPageTranslationVersionsInput {
  tenantId: string;
  pageTranslationId: string;
}

export function listPageTranslationVersions(
  deps: ListPageTranslationVersionsDeps,
  input: ListPageTranslationVersionsInput,
): Promise<PageTranslationVersion[]> {
  return deps.pageTranslationVersionRepository.listByTranslation(
    input.tenantId,
    input.pageTranslationId,
  );
}
