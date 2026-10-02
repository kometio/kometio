import { z } from 'zod';
import { pageStatusSchema } from '@kometio/shared-types';
import { request } from './http-client';

const dashboardStatsSchema = z.object({
  pages: z.object({ publishedCount: z.number(), draftCount: z.number() }),
  media: z.object({ count: z.number(), totalSizeBytes: z.number() }),
  forms: z.object({
    totalCount: z.number(),
    recentCount: z.number(),
    /** No payload: see DashboardRecentSubmissionItem's own comment on why. */
    recent: z.array(
      z.object({
        formId: z.string(),
        formName: z.string(),
        receivedAt: z.string(),
      }),
    ),
  }),
  recentActivity: z.array(
    z.object({
      pageGroupId: z.string(),
      pageTranslationId: z.string(),
      locale: z.string(),
      title: z.string(),
      slug: z.string(),
      status: pageStatusSchema,
      /** Online, and the draft has moved on since — the same answer the pages list gives. */
      hasUnpublishedChanges: z.boolean(),
      updatedAt: z.string(),
    }),
  ),
});

export type DashboardStatsDto = z.infer<typeof dashboardStatsSchema>;

export async function getDashboardStats(
  siteId: string,
): Promise<DashboardStatsDto> {
  const params = new URLSearchParams({ siteId });
  return dashboardStatsSchema.parse(
    await request(`/dashboard/stats?${params.toString()}`),
  );
}
