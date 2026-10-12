import type { SiteLayoutSectionVersion } from '@kometio/domain-core';
import type { VersionRepositoryPort } from './version-repository.port';

/** The history of one header or footer: `listByOwner` takes its id. */
export type SiteLayoutSectionVersionRepositoryPort =
  VersionRepositoryPort<SiteLayoutSectionVersion>;
