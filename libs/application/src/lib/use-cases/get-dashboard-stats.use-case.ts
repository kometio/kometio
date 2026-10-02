import type { DashboardStats, DashboardStatsPort } from '@kometio/ports';

export interface GetDashboardStatsDeps {
  dashboardStatsPort: DashboardStatsPort;
}

export interface GetDashboardStatsInput {
  tenantId: string;
  siteId: string;
}

const RECENT_ACTIVITY_LIMIT = 5;

export function getDashboardStats(
  deps: GetDashboardStatsDeps,
  input: GetDashboardStatsInput,
): Promise<DashboardStats> {
  return deps.dashboardStatsPort.getStats(
    input.tenantId,
    input.siteId,
    RECENT_ACTIVITY_LIMIT,
  );
}
