import { z } from 'zod';
import { auditActionSchema, auditDetailSchema } from '@kometio/shared-types';

export const ACTIVITY_MAX_PAGE_SIZE = 100;

export const listActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(ACTIVITY_MAX_PAGE_SIZE)
    .default(25),
});
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;

/**
 * One line of the site's activity (docs/adr/0130): who did what to what, and
 * when. The actor is described as the account is now; `null` where nobody was
 * the actor or the account has gone.
 */
export const activityEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  action: auditActionSchema,
  actor: z
    .object({
      id: z.string(),
      email: z.string(),
      displayName: z.string().nullable(),
    })
    .nullable(),
  targetId: z.string().nullable(),
  targetLabel: z.string().nullable(),
  detail: auditDetailSchema.nullable(),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export const paginatedActivitySchema = z.object({
  items: z.array(activityEntrySchema),
  total: z.number(),
});
export type PaginatedActivity = z.infer<typeof paginatedActivitySchema>;
