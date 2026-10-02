import { PageGroup, PageGroupNotFoundError } from '@kometio/domain-core';
import type {
  CollectionRepositoryPort,
  PageGroupRepositoryPort,
} from '@kometio/ports';
import { collectionInSite } from './page-placement';

export interface MovePageGroupToCollectionDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  collectionRepository: CollectionRepositoryPort;
}

export interface MovePageGroupToCollectionInput {
  tenantId: string;
  pageGroupId: string;
  /** `null` takes it out of every section, back among the site's pages. */
  collectionId: string | null;
  actorUserId: string | null;
}

/**
 * Files a page under a section of the editor, or takes it back out.
 *
 * It changes which screen lists the page and in what order — not its
 * address, not its place in the site's tree, not what a visitor sees.
 * The section is checked to exist, on this page's own site, first: a page
 * pointing at a section that does not would simply vanish from every
 * screen, which is the worst way to lose something.
 */
export async function movePageGroupToCollection(
  deps: MovePageGroupToCollectionDeps,
  input: MovePageGroupToCollectionInput,
): Promise<PageGroup> {
  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    input.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(input.pageGroupId);
  }
  if (input.collectionId !== null) {
    await collectionInSite(
      deps.collectionRepository,
      input.tenantId,
      group.siteId,
      input.collectionId,
    );
  }

  group.moveToCollection(input.collectionId, { by: input.actorUserId });
  await deps.pageGroupRepository.moveToCollection(group);
  return group;
}
