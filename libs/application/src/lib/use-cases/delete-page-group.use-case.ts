import {
  ChildPageAddressTakenError,
  PageGroupNotFoundError,
  PageSlugAlreadyExistsError,
  PageSlugCollidesWithTermError,
} from '@kometio/domain-core';
import {
  movePageGroupToParent,
  type MovePageGroupToParentDeps,
} from './move-page-group-to-parent.use-case';
import { assertPageTranslationAddressFree } from './page-translation-address';

/** What moving the subpages up needs, and deleting after it. */
export type DeletePageGroupDeps = MovePageGroupToParentDeps;

export interface DeletePageGroupInput {
  tenantId: string;
  pageGroupId: string;
  /** Recorded as who moved the subpages (their addresses change). */
  actorUserId: string | null;
}

/**
 * Deletes a page, and every one of its translations with it (ON DELETE
 * CASCADE, see schema.ts) — a group can't be deleted "partially".
 *
 * The pages directly under it move to the top level first, each through
 * `movePageGroupToParent`: its languages are re-addressed together, in one
 * write each. Whatever is under THOSE pages stays under them. Left where they
 * were, the subpages would sit at addresses under a page that no longer exists
 * and answer 404 everywhere — which is what deleting used to do, and why it
 * was refused for a while instead (ON DELETE RESTRICT stays as the safety net
 * for a subpage created in between).
 *
 * The OLD address of a moved page does not redirect: it begins with the
 * deleted page's own address, which is gone, so it answers 404 like the page
 * it was under. The subpage itself is reachable at its new one.
 *
 * Every subpage's address at the top level is checked before anything is
 * moved: one already taken there (by a page, a category or a term) refuses the
 * whole deletion, naming it (`ChildPageAddressTakenError`), rather than
 * leaving some moved and the parent still there.
 */
export async function deletePageGroup(
  deps: DeletePageGroupDeps,
  input: DeletePageGroupInput,
): Promise<void> {
  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    input.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(input.pageGroupId);
  }

  const children = await deps.pageGroupRepository.listSiblings(
    input.tenantId,
    group.siteId,
    group.id,
  );
  const translationsOf = new Map(
    await Promise.all(
      children.map(
        async (child) =>
          [
            child.id,
            await deps.pageTranslationRepository.listByGroup(
              input.tenantId,
              child.id,
            ),
          ] as const,
      ),
    ),
  );
  for (const translations of translationsOf.values()) {
    for (const translation of translations) {
      try {
        await assertPageTranslationAddressFree(deps, {
          tenantId: input.tenantId,
          siteId: group.siteId,
          locale: translation.locale,
          parentGroupId: null,
          slug: translation.slug,
        });
      } catch (error) {
        if (
          error instanceof PageSlugAlreadyExistsError ||
          error instanceof PageSlugCollidesWithTermError
        ) {
          throw new ChildPageAddressTakenError(
            translation.slug,
            translation.locale,
          );
        }
        throw error;
      }
    }
  }

  for (const child of children) {
    await movePageGroupToParent(deps, {
      tenantId: input.tenantId,
      pageGroupId: child.id,
      parentId: null,
      actorUserId: input.actorUserId,
    });
  }

  await deps.pageGroupRepository.delete(input.tenantId, input.pageGroupId);
}
