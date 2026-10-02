import type {
  CollectionRepositoryPort,
  ReusableSectionRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';

/** What the collections module's use cases are built from (see moduleDeps). */
export interface CollectionsDeps {
  siteRepository: SiteRepositoryPort;
  collectionRepository: CollectionRepositoryPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
}
