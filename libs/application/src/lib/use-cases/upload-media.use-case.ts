import { randomUUID } from 'node:crypto';
import {
  classifyUpload,
  Media,
  MediaTooLargeError,
} from '@kometio/domain-core';
import type {
  MediaRepositoryPort,
  MediaStoragePort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { requireSite } from './require-site';

export interface UploadMediaDeps {
  mediaRepository: MediaRepositoryPort;
  mediaStorage: MediaStoragePort;
  siteRepository: Pick<SiteRepositoryPort, 'findById'>;
}

export interface UploadMediaInput {
  tenantId: string;
  siteId: string;
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

/**
 * How big an upload may be, per kind of file (ADR-0054).
 *
 * One number could not serve both: 10MB is generous for a photo and
 * useless for a video, while a limit big enough for video would let a
 * mis-picked RAW image through as if it were fine.
 *
 * The video ceiling is deliberately modest. Self-hosted video is for a
 * short clip — a product loop, a testimonial — and anything longer is
 * better served by `VideoEmbed`, which costs the site owner no bandwidth
 * at all. It is also a memory decision: uploads are buffered in memory,
 * so the ceiling is what one request can hold.
 */
export const MAX_UPLOAD_BYTES_BY_KIND = {
  image: 10 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 64 * 1024 * 1024,
  // A price list or a brochure, not an archive of scans: generous for a
  // real document, and still what one buffered request can reasonably
  // hold.
  document: 20 * 1024 * 1024,
  // A zip, a font, a design file — the same ceiling the controller
  // already puts on any request, since there is no kind-specific reason
  // to go lower or room to go higher.
  other: 64 * 1024 * 1024,
} as const;

export async function uploadMedia(
  deps: UploadMediaDeps,
  input: UploadMediaInput,
): Promise<Media> {
  // Before anything is stored: a file for a site that is not this
  // tenant's would otherwise be written first and refused after.
  await requireSite(deps.siteRepository, input.tenantId, input.siteId);
  // Classified here as well as in the storage adapter, and deliberately:
  // the limit is a rule about what this application accepts, and it needs
  // to know what the file IS before it can say how big it may be. Nothing
  // is refused for its type any more (ADR-0070) — only for its size.
  const { kind } = classifyUpload(input.data, input.filename);
  const limit = MAX_UPLOAD_BYTES_BY_KIND[kind];
  if (input.data.byteLength > limit) {
    throw new MediaTooLargeError(kind, limit);
  }

  const uploaded = await deps.mediaStorage.upload({
    tenantId: input.tenantId,
    siteId: input.siteId,
    filename: input.filename,
    mimeType: input.mimeType,
    data: input.data,
  });

  const media = Media.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: input.siteId,
    filename: input.filename,
    storageKey: uploaded.storageKey,
    storageProvider: deps.mediaStorage.provider,
    mimeType: uploaded.mimeType,
    size: uploaded.size,
    width: uploaded.width,
    height: uploaded.height,
  });

  await deps.mediaRepository.add(media);
  return media;
}
