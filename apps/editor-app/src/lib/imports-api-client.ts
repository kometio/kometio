import { type ImportJobStatus } from '@kometio/shared-types';
import {
  type ImportJobList,
  type ImportJobRecord,
  importJobListSchema,
  importJobRecordSchema,
} from '@kometio/api-contracts';
import { API_BASE_URL, request } from './http-client';

export type { ImportJobList, ImportJobRecord, ImportJobStatus };

/**
 * Sends the export and gets back the job that will read it.
 *
 * `fetch` directly rather than `request()`: this one sends a file of up
 * to half a gigabyte, and the JSON client's own timeout is measured for
 * requests that carry a sentence.
 */
export async function startWordPressAnalysis(
  siteId: string,
  file: File,
): Promise<ImportJobRecord> {
  const body = new FormData();
  body.append('siteId', siteId);
  body.append('file', file);

  const res = await fetch(`${API_BASE_URL}/imports/wordpress/analysis`, {
    method: 'POST',
    credentials: 'include',
    body,
  });
  if (!res.ok) {
    throw new Error(`Import API error: ${res.status}`);
  }
  return importJobRecordSchema.parse(await res.json());
}

export async function getImportJob(id: string): Promise<ImportJobRecord> {
  return importJobRecordSchema.parse(await request(`/imports/${id}`));
}

export async function listImportJobs(siteId: string): Promise<ImportJobList> {
  return importJobListSchema.parse(
    await request(`/imports?siteId=${encodeURIComponent(siteId)}`),
  );
}
