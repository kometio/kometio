import { MediaNotFoundError, type Media } from '@kometio/domain-core';
import type { MediaRepositoryPort } from '@kometio/ports';

export interface UpdateMediaDeps {
  mediaRepository: MediaRepositoryPort;
}

export interface UpdateMediaInput {
  tenantId: string;
  mediaId: string;
  /** What the file is called; left as it is when absent. */
  filename?: string;
  /** Its alternative text; left as it is when absent, cleared with an empty string. */
  alt?: string;
}

/**
 * What a person writes about a file: its name and its alternative text.
 *
 * Neither reaches what is already on a page. A block that picked the file
 * keeps its own copy of the name (a download's label) and its own
 * alternative text, so renaming here fixes the library and what is picked
 * from now on, and does not rewrite published pages.
 */
export async function updateMedia(
  deps: UpdateMediaDeps,
  input: UpdateMediaInput,
): Promise<Media> {
  const media = await deps.mediaRepository.findById(
    input.tenantId,
    input.mediaId,
  );
  if (!media) {
    throw new MediaNotFoundError(input.mediaId);
  }
  if (input.filename !== undefined) media.rename(input.filename);
  if (input.alt !== undefined) media.changeAlt(input.alt);
  await deps.mediaRepository.save(media);
  return media;
}
