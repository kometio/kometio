import { queryOptions } from '@tanstack/react-query';
import { listActivity } from '../../lib/activity-api-client';

export const ACTIVITY_PAGE_SIZE = 25;

export function activityQueryOptions(page: number) {
  return queryOptions({
    queryKey: ['activity', page, ACTIVITY_PAGE_SIZE] as const,
    queryFn: () => listActivity(page, ACTIVITY_PAGE_SIZE),
    // What happened a minute ago is what the person came to see.
    staleTime: 0,
  });
}
