import { queryOptions } from '@tanstack/react-query';
import { getDashboardStats } from '../../lib/dashboard-api-client';

export function dashboardStatsQueryOptions(siteId: string) {
  return queryOptions({
    queryKey: ['dashboard-stats', siteId] as const,
    queryFn: () => getDashboardStats(siteId),
  });
}
