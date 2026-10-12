import { z } from 'zod';

export const listCollectionsQuerySchema = z.object({
  siteId: z.string().uuid(),
});
export type ListCollectionsQuery = z.infer<typeof listCollectionsQuerySchema>;

export const createCollectionBodySchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().min(1).max(60),
  icon: z.string().min(1).max(40).optional(),
});
export type CreateCollectionBody = z.infer<typeof createCollectionBodySchema>;

export const updateCollectionBodySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  icon: z.string().min(1).max(40).optional(),
  /** `null` clears it — a new page here then starts blank (docs/adr/0072). */
  defaultTemplateId: z.string().uuid().nullable().optional(),
});
export type UpdateCollectionBody = z.infer<typeof updateCollectionBodySchema>;
