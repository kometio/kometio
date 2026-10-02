import {
  PageGroup,
  PageGroupCannotBeItsOwnAncestorError,
  PageGroupNotFoundError,
} from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';
import { assertPageTranslationAddressFree } from './page-translation-address';
import { PageAncestry } from './page-ancestry';
import { pageGroupInSite } from './page-placement';

export interface MovePageGroupToParentDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  /** The destination is a new address for every language, and at the root a dimension or a term may already answer there (docs/adr/0064). */
  taxonomyRepository: TaxonomyRepositoryPort;
}

export interface MovePageGroupToParentInput {
  tenantId: string;
  pageGroupId: string;
  /** `null` moves it back among the site's top-level pages. */
  parentId: string | null;
  actorUserId: string | null;
}

/**
 * Moves a page to another place in the site's tree — and, unlike filing
 * it under a section (`movePageGroupToCollection`), this changes the
 * address every one of its languages answers at, and the address of
 * everything underneath it.
 *
 * So each language remembers where it used to hang before it is moved:
 * that memory is what `resolvePageGroupByPath` follows to answer the old
 * address with a 301 instead of a 404 (docs/adr/0074). A rename already
 * worked this way; a move is the same promise about a different part of
 * the address.
 *
 * It lands last among its new siblings rather than keeping the position
 * it had: order is only meaningful inside one sibling group, and the
 * number it carried from the old one would be a collision as often as
 * not.
 */
export async function movePageGroupToParent(
  deps: MovePageGroupToParentDeps,
  input: MovePageGroupToParentInput,
): Promise<PageGroup> {
  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    input.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(input.pageGroupId);
  }
  const previousParentId = group.parentId;
  if (previousParentId === input.parentId) {
    return group;
  }

  if (input.parentId !== null) {
    await assertDestinationCanHoldIt(deps, input, group);
  }

  const siblings = await deps.pageGroupRepository.listSiblings(
    input.tenantId,
    group.siteId,
    input.parentId,
  );
  const lastPosition = siblings.reduce(
    (highest, sibling) => Math.max(highest, sibling.order),
    -1,
  );

  const translations = await deps.pageTranslationRepository.listByGroup(
    input.tenantId,
    input.pageGroupId,
  );
  /*
   * Every language gets a new address, so every language is checked —
   * before anything is written, and by the same rule creating or renaming
   * one obeys. The destination refusing one language is the whole move
   * refused: half a page moved is a page answering at two addresses.
   */
  for (const translation of translations) {
    await assertPageTranslationAddressFree(deps, {
      tenantId: input.tenantId,
      siteId: group.siteId,
      locale: translation.locale,
      parentGroupId: input.parentId,
      slug: translation.slug,
    });
  }

  const edit = { by: input.actorUserId };
  for (const translation of translations) {
    translation.recordMovedFrom(previousParentId, input.parentId, edit);
  }
  group.setParent(input.parentId, edit);
  group.reorder(lastPosition + 1, edit);

  await deps.pageGroupRepository.move(group, translations);
  return group;
}

/**
 * The destination has to exist, belong to the same site, and not be the
 * page itself or anything below it — walked upwards from the destination,
 * which is cheaper than listing a whole subtree and stops at the root.
 */
async function assertDestinationCanHoldIt(
  deps: MovePageGroupToParentDeps,
  input: MovePageGroupToParentInput,
  group: PageGroup,
): Promise<void> {
  const chain = await new PageAncestry(
    async (ancestorId) =>
      (
        await pageGroupInSite(
          deps.pageGroupRepository,
          input.tenantId,
          group.siteId,
          ancestorId,
        )
      ).parentId,
  ).groupIdsDownTo(input.parentId);
  // `null` is a chain too deep to be anything but a loop already.
  if (chain === null || chain.includes(group.id)) {
    throw new PageGroupCannotBeItsOwnAncestorError(group.id);
  }
}
