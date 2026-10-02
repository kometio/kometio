import type { PageGroupVersion } from '@kometio/domain-core';
import type { PageGroupVersionRepositoryPort } from '@kometio/ports';

export interface ListPageGroupVersionsDeps {
  pageGroupVersionRepository: PageGroupVersionRepositoryPort;
}

export interface ListPageGroupVersionsInput {
  tenantId: string;
  pageGroupId: string;
}

export function listPageGroupVersions(
  deps: ListPageGroupVersionsDeps,
  input: ListPageGroupVersionsInput,
): Promise<PageGroupVersion[]> {
  return deps.pageGroupVersionRepository.listByGroup(
    input.tenantId,
    input.pageGroupId,
  );
}
