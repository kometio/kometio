import type { PageGroupRepositoryPort } from '@kometio/ports';

/**
 * The parent of a page group: its id, `null` at the root, or `undefined`
 * when the group is not there at all. Sync for a caller that already
 * holds every group of a site, async for one that asks the repository.
 */
export type ParentOf = (
  groupId: string,
) => string | null | undefined | Promise<string | null | undefined>;

/**
 * The one walk up the page tree. Every "where does this page live"
 * question starts here: the sitemap, the sidebar's tree, each language's
 * address, the breadcrumb, and the check that a move does not put a page
 * under itself. They used to be six loops with four copies of the depth
 * limit and three different ideas of what a missing ancestor means, and
 * the sidebar's idea (cut the path short) produced links that 404.
 *
 * One rule now: a chain that cannot be followed to the root is no chain.
 * A missing group, or a chain deeper than `MAX_DEPTH` (only a cycle gets
 * there), answers `null`, and the caller leaves that page out rather than
 * build an address from part of it.
 */
export class PageAncestry {
  /** Real sites are one to three levels deep; past this, the chain loops. */
  static readonly MAX_DEPTH = 20;

  constructor(private readonly parentOf: ParentOf) {}

  /** Asks the repository, one group per hop. */
  static fromRepository(
    pageGroupRepository: PageGroupRepositoryPort,
    tenantId: string,
  ): PageAncestry {
    return new PageAncestry(async (groupId) => {
      const group = await pageGroupRepository.findById(tenantId, groupId);
      return group ? group.parentId : undefined;
    });
  }

  /** Reads a map of every group the caller already holds. */
  static fromParents(parentIdByGroup: ReadonlyMap<string, string | null>) {
    return new PageAncestry((groupId) => parentIdByGroup.get(groupId));
  }

  /**
   * The groups from the root down to `parentId` itself; empty for a page
   * at the root. `null` when the chain breaks or loops.
   */
  async groupIdsDownTo(parentId: string | null): Promise<string[] | null> {
    const ids: string[] = [];
    let currentId = parentId;
    while (currentId !== null) {
      if (ids.length === PageAncestry.MAX_DEPTH) return null;
      const parent = await this.parentOf(currentId);
      if (parent === undefined) return null;
      ids.unshift(currentId);
      currentId = parent;
    }
    return ids;
  }

  /**
   * The slugs a page's address is built from, root first, when every
   * group above it has one (`slugOf`). `null` when any does not: a page
   * under a parent with no segment in that language has no address there.
   */
  async slugsDownTo(
    parentId: string | null,
    slugOf: (
      groupId: string,
    ) => string | undefined | Promise<string | undefined>,
  ): Promise<string[] | null> {
    const ids = await this.groupIdsDownTo(parentId);
    if (ids === null) return null;
    const slugs: string[] = [];
    for (const id of ids) {
      const slug = await slugOf(id);
      if (slug === undefined) return null;
      slugs.push(slug);
    }
    return slugs;
  }
}
