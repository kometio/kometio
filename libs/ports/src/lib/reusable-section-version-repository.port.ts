import type { ReusableSectionVersion } from '@kometio/domain-core';
import type { VersionRepositoryPort } from './version-repository.port';

/** The history of one reusable section: `listByOwner` takes its id. */
export type ReusableSectionVersionRepositoryPort =
  VersionRepositoryPort<ReusableSectionVersion>;
