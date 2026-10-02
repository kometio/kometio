import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { slugify } from '@kometio/shared-types';
import {
  createPageGroup as apiCreatePageGroup,
  deletePageGroup as apiDeletePageGroup,
  duplicatePageGroup as apiDuplicatePageGroup,
  movePageGroupToCollection as apiMovePageGroupToCollection,
  movePageGroupToParent as apiMovePageGroupToParent,
  reorderPageGroups as apiReorderPageGroups,
} from '../../lib/page-groups-api-client';
import { rememberGenerationPrompt } from './pending-page-generation';

export interface NewPageGroupInput {
  name: string;
  /** The page it hangs under, or `null` for the top level (docs/adr/0074). */
  parentId: string | null;
  /** Start from a copy of this template's blocks, or `null` to start blank (docs/adr/0072). */
  templateId: string | null;
  /** Written by the site's AI provider from this description, once the editor opens. */
  generationPrompt?: string;
}

/**
 * i18n a livello di campo (see the plan) — mirrors use-pages-list.ts's own
 * role for the new PageGroup model. It still seeds only the site's
 * default locale (the language switcher covers the rest once the group
 * exists); where the page hangs is asked at creation and changeable
 * afterwards (docs/adr/0074).
 */
export function usePageGroupsList(
  siteId: string,
  defaultLocale: string,
  /** The collection a new page is created in — null on the Pages screen, an id on a collection's own. */
  collectionId: string | null = null,
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Partial key: invalidates every cached filter/page combination for
  // this site's list (see page-groups-queries.ts, whose full key also
  // includes page/filters), not just whichever one is on screen right now.
  const invalidateList = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['page-groups', 'list', siteId],
      }),
    [queryClient, siteId],
  );

  const createPageGroupMutation = useMutation({
    // One request: the page and its first language are written together
    // (docs/adr/0072). As two, a language refused for its address left a
    // page with no language behind.
    mutationFn: ({ name, templateId, parentId }: NewPageGroupInput) =>
      apiCreatePageGroup({
        siteId,
        collectionId,
        parentId,
        ...(templateId ? { templateId } : {}),
        translation: {
          locale: defaultLocale,
          slug: slugify(name),
          seoMeta: { title: name, description: '' },
        },
      }),
    onSuccess: async (group, { generationPrompt }) => {
      await invalidateList();
      if (generationPrompt) {
        rememberGenerationPrompt(queryClient, group.id, generationPrompt);
      }
      await navigate({
        to: '/page-groups/$groupId',
        params: { groupId: group.id },
      });
    },
  });

  const deletePageGroupMutation = useMutation({
    mutationFn: (groupId: string) => apiDeletePageGroup(groupId),
    onSuccess: invalidateList,
  });

  const duplicatePageGroupMutation = useMutation({
    mutationFn: (groupId: string) => apiDuplicatePageGroup(groupId),
    // It stays in the list: the copy is one of the pages in front of you,
    // and the next thing to do with it is often another duplicate. The
    // list offers the way in ("Open the copy"), it does not take it.
    onSuccess: invalidateList,
  });

  /**
   * Files an existing page under a collection, or takes it out of one.
   *
   * The endpoint has been there since collections arrived; nothing in the
   * editor called it, so the only way into a collection was to create the
   * page from inside it — and a page written before the collection existed
   * had to be written again. It changes where the page is LISTED and
   * nothing else: not its address, not its place in the tree
   * (moveToCollection, in the domain).
   */
  const moveToCollectionMutation = useMutation({
    mutationFn: ({
      groupId,
      targetCollectionId,
    }: {
      groupId: string;
      targetCollectionId: string | null;
    }) => apiMovePageGroupToCollection(groupId, targetCollectionId),
    onSuccess: invalidateList,
  });

  /**
   * Moves a page to another place in the site's tree.
   *
   * Unlike filing it under a collection, this changes the address the
   * page answers at and the address of everything under it — the old one
   * answers with a 301 afterwards (docs/adr/0074), which is why nothing
   * here has to warn about broken links.
   */
  const moveToParentMutation = useMutation({
    mutationFn: ({
      groupId,
      targetParentId,
    }: {
      groupId: string;
      targetParentId: string | null;
    }) => apiMovePageGroupToParent(groupId, targetParentId),
    onSuccess: invalidateList,
  });

  const reorderPageGroupsMutation = useMutation({
    mutationFn: ({
      parentId,
      orderedPageGroupIds,
    }: {
      parentId: string | null;
      orderedPageGroupIds: string[];
    }) => apiReorderPageGroups(siteId, parentId, orderedPageGroupIds),
    onSuccess: invalidateList,
  });

  return {
    createPageGroup: createPageGroupMutation.mutateAsync,
    isCreating: createPageGroupMutation.isPending,
    deletePageGroup: deletePageGroupMutation.mutateAsync,
    isDeleting: deletePageGroupMutation.isPending,
    duplicatePageGroup: duplicatePageGroupMutation.mutateAsync,
    isDuplicating: duplicatePageGroupMutation.isPending,
    moveToCollection: (groupId: string, targetCollectionId: string | null) =>
      moveToCollectionMutation.mutateAsync({ groupId, targetCollectionId }),
    isMoving: moveToCollectionMutation.isPending,
    moveToParent: (groupId: string, targetParentId: string | null) =>
      moveToParentMutation.mutateAsync({ groupId, targetParentId }),
    isMovingToParent: moveToParentMutation.isPending,
    reorderPageGroups: (
      parentId: string | null,
      orderedPageGroupIds: string[],
    ) =>
      reorderPageGroupsMutation.mutateAsync({ parentId, orderedPageGroupIds }),
  };
}
