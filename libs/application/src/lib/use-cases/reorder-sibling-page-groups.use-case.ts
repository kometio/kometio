import { PageGroupReorderMismatchError } from '@kometio/domain-core';
import type { PageGroupRepositoryPort } from '@kometio/ports';

export interface ReorderSiblingPageGroupsDeps {
  pageGroupRepository: PageGroupRepositoryPort;
}

export interface ReorderSiblingPageGroupsInput {
  tenantId: string;
  siteId: string;
  parentId: string | null;
  /** The full sibling group, id-only, in the desired new order (drag-and-drop hands this back as one complete list on drop). */
  orderedPageGroupIds: string[];
  /** Recorded as the page's last editor — see EditContext in @kometio/domain-core. */
  actorUserId: string | null;
}

/**
 * Mirrors the old reorderSiblingPages — same all-or-nothing permutation
 * discipline (see that use-case's own history for why), scoped by
 * `parentId` only, not `(locale, parentId)`: a PageGroup's position in the
 * hierarchy is shared across every one of its translations now, there's
 * no separate per-locale sibling group to keep in sync (that was the
 * whole point of the rewrite).
 */
export async function reorderSiblingPageGroups(
  deps: ReorderSiblingPageGroupsDeps,
  input: ReorderSiblingPageGroupsInput,
): Promise<void> {
  const siblings = await deps.pageGroupRepository.listSiblings(
    input.tenantId,
    input.siteId,
    input.parentId,
  );
  const actualIds = new Set(siblings.map((sibling) => sibling.id));
  const providedIds = new Set(input.orderedPageGroupIds);
  const isExactPermutation =
    actualIds.size === providedIds.size &&
    input.orderedPageGroupIds.length === providedIds.size &&
    [...actualIds].every((id) => providedIds.has(id));
  if (!isExactPermutation) {
    throw new PageGroupReorderMismatchError();
  }

  // One statement for every sibling: a read and a full write per page
  // used to write back contents read a moment earlier, over any save that
  // landed in between. A sibling deleted since the check above is simply
  // not there to reorder.
  await deps.pageGroupRepository.reorderSiblings({
    tenantId: input.tenantId,
    siteId: input.siteId,
    parentId: input.parentId,
    orderedIds: input.orderedPageGroupIds,
    by: input.actorUserId,
    at: new Date(),
  });
}
