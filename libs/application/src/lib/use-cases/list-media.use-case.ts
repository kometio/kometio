import type { Media } from '@kometio/domain-core';
import type {
  MediaFilter,
  MediaRepositoryPort,
  PaginatedResult,
  Pagination,
} from '@kometio/ports';

export interface ListMediaDeps {
  mediaRepository: MediaRepositoryPort;
}

export interface ListMediaInput {
  tenantId: string;
  siteId: string;
  page: number;
  pageSize: number;
  /** Narrows the library by name or by kind — see MediaFilter for why the database answers it. */
  filter?: MediaFilter;
}

export function listMedia(
  deps: ListMediaDeps,
  input: ListMediaInput,
): Promise<PaginatedResult<Media>> {
  const pagination: Pagination = { page: input.page, pageSize: input.pageSize };
  return deps.mediaRepository.listBySite(
    input.tenantId,
    input.siteId,
    pagination,
    input.filter,
  );
}
