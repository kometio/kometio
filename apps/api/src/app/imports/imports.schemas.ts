import { z } from 'zod';

export const startWordPressAnalysisBodySchema = z.object({
  siteId: z.string().uuid(),
});
export type StartWordPressAnalysisBody = z.infer<
  typeof startWordPressAnalysisBodySchema
>;

export const listImportJobsQuerySchema = z.object({
  siteId: z.string().uuid(),
});
export type ListImportJobsQuery = z.infer<typeof listImportJobsQuerySchema>;
