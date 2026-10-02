import type {
  MediaRepositoryPort,
  MediaStoragePort,
  MediaUsagePort,
  SiteRepositoryPort,
} from '@kometio/ports';

/** What the media module's use cases are built from (see moduleDeps). */
export interface MediaDeps {
  siteRepository: SiteRepositoryPort;
  mediaRepository: MediaRepositoryPort;
  mediaStorage: MediaStoragePort;
  mediaUsage: MediaUsagePort;
}
