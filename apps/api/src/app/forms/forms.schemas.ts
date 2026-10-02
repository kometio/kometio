import { z } from 'zod';
import { MAX_NOTIFICATION_EMAILS } from '@kometio/domain-core';
import { formFieldsSchema, formStepsSchema } from '@kometio/shared-types';

export const createFormBodySchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().min(1),
});
export type CreateFormBody = z.infer<typeof createFormBodySchema>;

export const duplicateFormBodySchema = z.object({
  // The same rule as a new form's name: what the copy is called is the
  // caller's to say.
  name: createFormBodySchema.shape.name,
});
export type DuplicateFormBody = z.infer<typeof duplicateFormBodySchema>;

export const listFormsQuerySchema = z.object({
  siteId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListFormsQuery = z.infer<typeof listFormsQuerySchema>;

export const updateFormBodySchema = z.object({
  name: z.string().min(1),
  fields: formFieldsSchema,
  steps: formStepsSchema.default([]),
  notificationEmails: z
    .array(z.string().trim().email())
    .max(MAX_NOTIFICATION_EMAILS)
    .default([]),
});
export type UpdateFormBody = z.infer<typeof updateFormBodySchema>;

export const listFormSubmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Lower than the forms list's own cap: a submission row carries a whole
  // payload, not a name and a date.
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListFormSubmissionsQuery = z.infer<
  typeof listFormSubmissionsQuerySchema
>;
