import {
  PageTranslationNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import type { PageTranslationRepositoryPort } from '@kometio/ports';

export interface GetPageTranslationByIdDeps {
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface GetPageTranslationByIdInput {
  tenantId: string;
  pageTranslationId: string;
}

export async function getPageTranslationById(
  deps: GetPageTranslationByIdDeps,
  input: GetPageTranslationByIdInput,
): Promise<PageTranslation> {
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }
  return translation;
}
