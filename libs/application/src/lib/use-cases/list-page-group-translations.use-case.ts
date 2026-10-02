import {
  PageGroupNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';

export interface ListPageGroupTranslationsDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface ListPageGroupTranslationsInput {
  tenantId: string;
  pageGroupId: string;
}

export async function listPageGroupTranslations(
  deps: ListPageGroupTranslationsDeps,
  input: ListPageGroupTranslationsInput,
): Promise<PageTranslation[]> {
  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    input.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(input.pageGroupId);
  }
  return deps.pageTranslationRepository.listByGroup(
    input.tenantId,
    input.pageGroupId,
  );
}
