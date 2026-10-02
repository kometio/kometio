import { randomUUID } from 'node:crypto';
import { PageGroup, type PageGroupVersion } from '@kometio/domain-core';
import type { PageContent } from '@kometio/shared-types';
import type { PageGroupRepositoryPort } from '@kometio/ports';
import { placePageGroup, type PagePlacementDeps } from './page-placement';

export type CreatePageGroupDeps = PagePlacementDeps;

export interface CreatePageGroupInput {
  tenantId: string;
  siteId: string;
  parentId?: string | null;
  content?: PageContent;
  /** Which section of the editor this page is being created from — see the Collection entity. */
  collectionId?: string | null;
  createdBy: string | null;
}

export interface BuiltPageGroup {
  group: PageGroup;
  /** The version row its first save has to carry — never a structure saved without one. */
  version: PageGroupVersion;
}

/**
 * A new group, appended after its siblings, with its first version — built
 * and NOT saved (and not checked: where it goes is `placePageGroup`'s
 * question, asked by every caller that takes it from a request), so a caller that must write it together with something
 * else (its first language, see createPage) can do so in one transaction.
 */
export async function buildPageGroup(
  pageGroupRepository: PageGroupRepositoryPort,
  input: CreatePageGroupInput,
): Promise<BuiltPageGroup> {
  // The -1 seed: Math.max over an empty sibling array is -Infinity, not a
  // sensible "no siblings yet" default.
  const siblings = await pageGroupRepository.listSiblings(
    input.tenantId,
    input.siteId,
    input.parentId ?? null,
  );
  const order = Math.max(-1, ...siblings.map((sibling) => sibling.order)) + 1;

  const group = PageGroup.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: input.siteId,
    parentId: input.parentId,
    content: input.content,
    collectionId: input.collectionId,
    order,
    createdBy: input.createdBy,
  });
  return {
    group,
    version: {
      id: randomUUID(),
      tenantId: group.tenantId,
      pageGroupId: group.id,
      content: group.content,
      createdBy: input.createdBy,
      createdAt: group.updatedAt,
    },
  };
}

/**
 * Creates only the shared structure (see createPageGroup vs.
 * createPageGroupTranslation in the i18n plan) — a group with zero
 * translations is a valid intermediate state for the API, the caller adds
 * at least one locale next. The editor does not go this way any more: it
 * creates a page and its first language together (createPage), because a
 * language refused for its address used to leave the group behind.
 */
export async function createPageGroup(
  deps: CreatePageGroupDeps,
  input: CreatePageGroupInput,
): Promise<PageGroup> {
  await placePageGroup(deps, input);
  const { group, version } = await buildPageGroup(
    deps.pageGroupRepository,
    input,
  );
  await deps.pageGroupRepository.addWithVersion(group, version);
  return group;
}
