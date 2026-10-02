import { randomUUID } from 'node:crypto';
import {
  PageGroupNotFoundError,
  PageGroupVersionNotFoundError,
  type PageGroup,
} from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageGroupVersionRepositoryPort,
} from '@kometio/ports';

export interface RollbackPageGroupToVersionDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageGroupVersionRepository: PageGroupVersionRepositoryPort;
}

export interface RollbackPageGroupToVersionInput {
  tenantId: string;
  pageGroupId: string;
  versionId: string;
  actorUserId: string | null;
}

/**
 * Restores the shared draft structure to a previous PageGroupVersion
 * snapshot and records the rollback itself as a new version (never a
 * destructive overwrite) — mirrors the old rollbackToVersion's discipline,
 * scoped to PageGroup.content instead of the old Page's own content. Does
 * NOT republish: same as before, a rollback only ever touches the draft.
 */
export async function rollbackPageGroupToVersion(
  deps: RollbackPageGroupToVersionDeps,
  input: RollbackPageGroupToVersionInput,
): Promise<PageGroup> {
  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    input.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(input.pageGroupId);
  }

  const version = await deps.pageGroupVersionRepository.findById(
    input.tenantId,
    input.versionId,
  );
  if (!version || version.pageGroupId !== group.id) {
    throw new PageGroupVersionNotFoundError(input.versionId);
  }

  group.saveContent(version.content, { by: input.actorUserId });
  await deps.pageGroupRepository.saveContent(group, {
    id: randomUUID(),
    tenantId: group.tenantId,
    pageGroupId: group.id,
    content: group.content,
    createdBy: input.actorUserId,
    createdAt: group.updatedAt,
  });

  return group;
}
