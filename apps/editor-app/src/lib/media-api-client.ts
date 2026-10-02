import { type MediaKind } from '@kometio/shared-types';
import {
  type MediaKindCounts,
  type MediaRecord,
  type MediaUsage,
  type PaginatedMedia,
  mediaKindCountsSchema,
  mediaRecordSchema,
  mediaUsageSchema,
  paginatedMediaSchema,
} from '@kometio/api-contracts';
import { request, send } from './http-client';

export type { MediaKindCounts, MediaRecord, MediaUsage, PaginatedMedia };

/** What the library is narrowed to — see the same type on the server side for why the database answers it rather than the client. */
export interface MediaFilters {
  /** Part of a filename. */
  search?: string;
  kind?: MediaKind;
}

/** How many files each of the library's folders holds. */
export async function countMediaByKind(
  siteId: string,
): Promise<MediaKindCounts> {
  const params = new URLSearchParams({ siteId });
  return mediaKindCountsSchema.parse(
    await request(`/media/kinds?${params.toString()}`),
  );
}

export async function listMedia(
  siteId: string,
  page: number,
  pageSize: number,
  filters: MediaFilters = {},
): Promise<PaginatedMedia> {
  const params = new URLSearchParams({
    siteId,
    page: String(page),
    pageSize: String(pageSize),
  });
  // Left out entirely rather than sent empty: an empty `search` would be a
  // filter the server has to decide to ignore.
  if (filters.search) {
    params.set('search', filters.search);
  }
  if (filters.kind) {
    params.set('kind', filters.kind);
  }
  return paginatedMediaSchema.parse(
    await request(`/media?${params.toString()}`),
  );
}

export async function uploadMedia(
  siteId: string,
  file: File,
): Promise<MediaRecord> {
  const body = new FormData();
  body.append('siteId', siteId);
  body.append('file', file);
  return mediaRecordSchema.parse(
    await request('/media', { method: 'POST', body }),
  );
}

/** One file, for an address that names it and cannot count on the list having loaded it. */
export async function getMedia(id: string): Promise<MediaRecord> {
  return mediaRecordSchema.parse(await request(`/media/${id}`));
}

/** What a person writes about a file. Neither reaches a page that has already picked it. */
export async function updateMedia(
  id: string,
  changes: { filename?: string; alt?: string },
): Promise<MediaRecord> {
  return mediaRecordSchema.parse(
    await request(`/media/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),
  );
}

/** The pages, shared sections and header or footer that hold the file. */
export async function getMediaUsages(id: string): Promise<MediaUsage> {
  return mediaUsageSchema.parse(await request(`/media/${id}/usages`));
}

export function deleteMedia(id: string): Promise<void> {
  return send(`/media/${id}`, { method: 'DELETE' });
}
