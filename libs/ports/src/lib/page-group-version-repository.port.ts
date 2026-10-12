import type { PageGroupVersion } from '@kometio/domain-core';
import type { VersionRepositoryPort } from './version-repository.port';

/** The history of one page: `listByOwner` takes its id. */
export type PageGroupVersionRepositoryPort =
  VersionRepositoryPort<PageGroupVersion>;
