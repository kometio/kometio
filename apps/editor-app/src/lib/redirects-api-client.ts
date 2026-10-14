import {
  paginatedMissingPathsSchema,
  paginatedRedirectsSchema,
  redirectImportReportSchema,
  redirectRecordSchema,
  redirectTestResultSchema,
  wordPressRedirectPlanSchema,
  type CreateRedirectBody,
  type MissingPathRecord,
  type PaginatedMissingPaths,
  type PaginatedRedirects,
  type RedirectImportReport,
  type RedirectRecord,
  type RedirectTestResult,
  type UpdateRedirectBody,
  type WordPressRedirectPlan,
} from '@kometio/api-contracts';
import { request, send } from './http-client';

export type {
  MissingPathRecord,
  PaginatedMissingPaths,
  PaginatedRedirects,
  RedirectImportReport,
  RedirectRecord,
  RedirectTestResult,
  WordPressRedirectPlan,
};

export interface ListRedirectsFilters {
  /** Part of the old address or of where it goes. */
  search?: string;
  origin?: RedirectRecord['origin'];
  /** Only the rules whose page was deleted. */
  needsATarget?: boolean;
}

export async function listRedirects(
  siteId: string,
  page: number,
  pageSize: number,
  filters: ListRedirectsFilters = {},
): Promise<PaginatedRedirects> {
  const params = new URLSearchParams({
    siteId,
    page: String(page),
    pageSize: String(pageSize),
  });
  if (filters.search) params.set('search', filters.search);
  if (filters.origin) params.set('origin', filters.origin);
  if (filters.needsATarget !== undefined) {
    params.set('needsATarget', String(filters.needsATarget));
  }
  return paginatedRedirectsSchema.parse(
    await request(`/redirects?${params.toString()}`),
  );
}

export async function createRedirect(
  input: CreateRedirectBody,
): Promise<RedirectRecord> {
  return redirectRecordSchema.parse(
    await request('/redirects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

/** The whole rule, every time: the API reads an absent `to` as "gone". */
export async function updateRedirect(
  id: string,
  input: UpdateRedirectBody,
): Promise<RedirectRecord> {
  return redirectRecordSchema.parse(
    await request(`/redirects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export function deleteRedirect(id: string): Promise<void> {
  return send(`/redirects/${id}`, { method: 'DELETE' });
}

/** `dryRun` says what would happen and writes nothing; the answer has the same shape either way. */
export async function importRedirects(input: {
  siteId: string;
  csv: string;
  dryRun: boolean;
}): Promise<RedirectImportReport> {
  return redirectImportReportSchema.parse(
    await request('/redirects/import', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function testRedirect(
  siteId: string,
  address: string,
): Promise<RedirectTestResult> {
  return redirectTestResultSchema.parse(
    await request('/redirects/test', {
      method: 'POST',
      body: JSON.stringify({ siteId, address }),
    }),
  );
}

export async function listMissingPaths(
  siteId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedMissingPaths> {
  const params = new URLSearchParams({
    siteId,
    page: String(page),
    pageSize: String(pageSize),
  });
  return paginatedMissingPathsSchema.parse(
    await request(`/redirects/missing?${params.toString()}`),
  );
}

export function dismissMissingPath(id: string): Promise<void> {
  return send(`/redirects/missing/${id}/dismiss`, { method: 'POST' });
}

/**
 * The redirects of a WordPress move, from a file that has been read in
 * Import. `dryRun` judges and writes nothing; the answer has the same shape
 * either way, so that what is shown before is what is done.
 */
export async function redirectsFromWordPress(input: {
  siteId: string;
  importJobId: string;
  dryRun: boolean;
}): Promise<WordPressRedirectPlan> {
  return wordPressRedirectPlanSchema.parse(
    await request('/redirects/wordpress', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}
