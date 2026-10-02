import {
  CollectionNotFoundError,
  PageGroupNotFoundError,
  type Collection,
  type PageGroup,
  type Site,
} from '@kometio/domain-core';
import type {
  CollectionRepositoryPort,
  PageGroupRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { requireSite } from './require-site';

/**
 * Where a page may be put: under a page, or into a collection, of its own
 * site. Creating a page and moving one ask the same two questions, and
 * they used to be asked in one place and not the other: a page could be
 * created under another site's page, or filed in another site's section,
 * because the foreign key checks only that the row exists, and row-level
 * security only that it is the same tenant. An id that named nothing got
 * past both into the insert and came back as a 500.
 *
 * Something that is not there and something that belongs to another site
 * answer the same "not found": this site has no such page.
 */
export async function pageGroupInSite(
  pageGroupRepository: PageGroupRepositoryPort,
  tenantId: string,
  siteId: string,
  pageGroupId: string,
): Promise<PageGroup> {
  const group = await pageGroupRepository.findById(tenantId, pageGroupId);
  if (!group || group.siteId !== siteId) {
    throw new PageGroupNotFoundError(pageGroupId);
  }
  return group;
}

export async function collectionInSite(
  collectionRepository: CollectionRepositoryPort,
  tenantId: string,
  siteId: string,
  collectionId: string,
): Promise<Collection> {
  const collection = await collectionRepository.findById(
    tenantId,
    collectionId,
  );
  if (!collection || collection.siteId !== siteId) {
    throw new CollectionNotFoundError(collectionId);
  }
  return collection;
}

export interface PagePlacementDeps {
  siteRepository: SiteRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  collectionRepository: CollectionRepositoryPort;
}

/**
 * Checks where a new page is asked to go, before anything is written: the
 * site, the parent page and the collection. Answers with the site, which
 * the caller needs next for the page's language.
 */
export async function placePageGroup(
  deps: PagePlacementDeps,
  input: {
    tenantId: string;
    siteId: string;
    parentId?: string | null;
    collectionId?: string | null;
  },
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );
  if (input.parentId) {
    await pageGroupInSite(
      deps.pageGroupRepository,
      input.tenantId,
      site.id,
      input.parentId,
    );
  }
  if (input.collectionId) {
    await collectionInSite(
      deps.collectionRepository,
      input.tenantId,
      site.id,
      input.collectionId,
    );
  }
  return site;
}
