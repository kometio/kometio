import { MediaNotFoundError, type Media } from '@kometio/domain-core';
import type { MediaRepositoryPort } from '@kometio/ports';

export interface GetMediaDeps {
  mediaRepository: MediaRepositoryPort;
}

export interface GetMediaInput {
  tenantId: string;
  mediaId: string;
}

/** One file of the library, for a link that names it — `?file=<id>` — and so cannot count on the list having loaded it. */
export async function getMedia(
  deps: GetMediaDeps,
  input: GetMediaInput,
): Promise<Media> {
  const media = await deps.mediaRepository.findById(
    input.tenantId,
    input.mediaId,
  );
  if (!media) {
    throw new MediaNotFoundError(input.mediaId);
  }
  return media;
}
