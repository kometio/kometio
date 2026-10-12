import { z } from 'zod';

export const getDashboardStatsQuerySchema = z.object({
  siteId: z.string().uuid(),
});
export type GetDashboardStatsQuery = z.infer<
  typeof getDashboardStatsQuerySchema
>;
