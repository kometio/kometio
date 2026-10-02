import { z } from 'zod';
import { formFieldSchema, formStepSchema } from '@kometio/shared-types';

/**
 * A form as the editor sees it — every `/forms` response that carries one
 * form, and each row of the list (docs/adr/0026).
 *
 * `submissionCount` travels with every one of them, not only with the
 * list: the form editor labels its Submissions tab with it, and a save
 * replaces the cached form with the PATCH response, so a count that only
 * the list sent would vanish on the first save.
 */
export const formRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  name: z.string(),
  fields: z.array(formFieldSchema),
  steps: z.array(formStepSchema),
  /** Who is emailed each submission; empty means nobody (docs/adr/0086). */
  notificationEmails: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  submissionCount: z.number().int().nonnegative(),
});

export type FormRecord = z.infer<typeof formRecordSchema>;

export const paginatedFormsSchema = z.object({
  items: z.array(formRecordSchema),
  total: z.number(),
});

export type PaginatedForms = z.infer<typeof paginatedFormsSchema>;

/** One submission, as `GET /forms/:id/submissions` lists it. */
export const formSubmissionRecordSchema = z.object({
  id: z.string(),
  /** Keyed by field id — see FormField.id's own comment for why that is stable. */
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  /**
   * The page this was filled on, as an id to look up in the envelope's
   * `pages`. `null` for a submission recorded before the public site knew
   * which page it was rendering, and for one whose page has since been
   * deleted.
   */
  pageId: z.string().nullable(),
});

export type FormSubmissionRecord = z.infer<typeof formSubmissionRecordSchema>;

/** One page a batch of submissions came from — named once, not per row. */
export const submissionOriginPageRecordSchema = z.object({
  id: z.string(),
  pageGroupId: z.string(),
  locale: z.string(),
  title: z.string(),
});

export type SubmissionOriginPageRecord = z.infer<
  typeof submissionOriginPageRecordSchema
>;

export const paginatedFormSubmissionsSchema = z.object({
  items: z.array(formSubmissionRecordSchema),
  total: z.number(),
  /**
   * The form's fields as they stand now, sent with the page because a
   * payload keyed by field id cannot be rendered without them. A key not
   * in here is an answer to a field that has since been removed — still a
   * real answer, and still shown.
   */
  fields: z.array(formFieldSchema),
  /**
   * The pages this page of submissions came from. Only the ones actually
   * referenced, so a form on one page sends one entry however many
   * submissions it has.
   */
  pages: z.array(submissionOriginPageRecordSchema),
});

export type PaginatedFormSubmissions = z.infer<
  typeof paginatedFormSubmissionsSchema
>;

/**
 * `GET /public/forms/:id` — what the public site needs to draw a form.
 * `notificationEmails` is left out on purpose: it is the owner's private
 * configuration, and this response reaches every visitor's page.
 */
export const publicFormSchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(formFieldSchema),
  steps: z.array(formStepSchema),
});

export type PublicForm = z.infer<typeof publicFormSchema>;

/**
 * `GET /sites/:id/form-submissions/count?olderThanDays=N` — how many
 * answers a retention of N days would delete at its next clean-up.
 */
export const formSubmissionCountSchema = z.object({ count: z.number() });

export type FormSubmissionCount = z.infer<typeof formSubmissionCountSchema>;
