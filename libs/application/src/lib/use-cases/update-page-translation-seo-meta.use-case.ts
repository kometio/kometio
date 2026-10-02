import {
  PageTranslationNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import type { SeoMeta } from '@kometio/shared-types';
import type { PageTranslationRepositoryPort } from '@kometio/ports';

export interface UpdatePageTranslationSeoMetaDeps {
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface UpdatePageTranslationSeoMetaInput {
  tenantId: string;
  pageTranslationId: string;
  seoMeta: SeoMeta;
  /** Recorded as the page's last editor — see EditContext in @kometio/domain-core. */
  actorUserId: string | null;
}

export async function updatePageTranslationSeoMeta(
  deps: UpdatePageTranslationSeoMetaDeps,
  input: UpdatePageTranslationSeoMetaInput,
): Promise<PageTranslation> {
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }

  translation.updateSeoMeta(input.seoMeta, {
    by: input.actorUserId,
  });
  await deps.pageTranslationRepository.saveSeoMeta(translation);

  return translation;
}
