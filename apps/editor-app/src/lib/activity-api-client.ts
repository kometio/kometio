import {
  paginatedActivitySchema,
  type PaginatedActivity,
} from '@kometio/api-contracts';
import { request } from './http-client';

/** The site's activity, newest first (docs/adr/0130): an administrator's. */
export async function listActivity(
  page: number,
  pageSize: number,
): Promise<PaginatedActivity> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return paginatedActivitySchema.parse(
    await request(`/activity?${params.toString()}`),
  );
}
