import type { DashboardStatsPort } from '@kometio/ports';

/** What the dashboard module's use cases are built from (see moduleDeps). */
export interface DashboardDeps {
  dashboardStatsPort: DashboardStatsPort;
}
