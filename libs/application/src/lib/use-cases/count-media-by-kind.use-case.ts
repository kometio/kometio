import type { MediaKind } from '@kometio/shared-types';
import type { MediaRepositoryPort } from '@kometio/ports';

export interface CountMediaByKindDeps {
  mediaRepository: MediaRepositoryPort;
}

export interface CountMediaByKindInput {
  tenantId: string;
  siteId: string;
}

/**
 * How many files the library has in each of its five folders.
 *
 * Its own question rather than five listings with `pageSize: 1`: those
 * would be five round trips to draw one screen, each counting the same
 * table again.
 */
export function countMediaByKind(
  deps: CountMediaByKindDeps,
  input: CountMediaByKindInput,
): Promise<Record<MediaKind, number>> {
  return deps.mediaRepository.countByKind(input.tenantId, input.siteId);
}
