import { MediaNotFoundError } from '@kometio/domain-core';
import type { MediaRepositoryPort, MediaStoragePort } from '@kometio/ports';

export interface DeleteMediaDeps {
  mediaRepository: MediaRepositoryPort;
  mediaStorage: MediaStoragePort;
}

export interface DeleteMediaInput {
  tenantId: string;
  mediaId: string;
}

export async function deleteMedia(
  deps: DeleteMediaDeps,
  input: DeleteMediaInput,
): Promise<void> {
  const media = await deps.mediaRepository.findById(
    input.tenantId,
    input.mediaId,
  );
  if (!media) {
    throw new MediaNotFoundError(input.mediaId);
  }

  // Storage first: if this fails, the DB row (and its still-valid file)
  // stays around instead of the row disappearing while the file leaks.
  await deps.mediaStorage.delete(media.storageKey);
  await deps.mediaRepository.delete(input.tenantId, input.mediaId);
}
