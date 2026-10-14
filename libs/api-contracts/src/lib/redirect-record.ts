import { z } from 'zod';

export const redirectStatusSchema = z.union([
  z.literal(301),
  z.literal(302),
  z.literal(410),
]);

/**
 * Where a rule sends, as the editor reads it. A page comes with what a
 * person needs to know it by — its title, where it answers now, whether it
 * does — because an id is no way to read a list of rules.
 */
export const redirectTargetRecordSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('page'),
    /** `null` once the page is deleted: the rule needs a target again. */
    pageGroupId: z.string().nullable(),
    locale: z.string(),
    title: z.string().nullable(),
    /** Where it answers now; `null` while it is not published in that language. */
    path: z.string().nullable(),
    isPublished: z.boolean(),
  }),
  z.object({ kind: z.literal('url'), url: z.string() }),
]);

/** One rule, as `/redirects` answers (docs/adr/0127). */
export const redirectRecordSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  /** The old address as a person reads it: `/2019/05/old`, `/?p=123`, `/:year/:slug`. */
  from: z.string(),
  kind: z.enum(['exact', 'pattern']),
  /** `null` for a rule that says the address is gone. */
  target: redirectTargetRecordSchema.nullable(),
  status: redirectStatusSchema,
  origin: z.enum(['manual', 'list', 'wordpress']),
  hits: z.number().int().nonnegative(),
  lastHitAt: z.string().nullable(),
  /** The page it sent to was deleted: it answers nothing until it has a new one. */
  needsATarget: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RedirectRecord = z.infer<typeof redirectRecordSchema>;

export const paginatedRedirectsSchema = z.object({
  items: z.array(redirectRecordSchema),
  total: z.number(),
});
export type PaginatedRedirects = z.infer<typeof paginatedRedirectsSchema>;

/** What asking "where does this address go" answers. */
export const redirectTestResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('page'), path: z.string() }),
  z.object({ outcome: z.literal('moved'), location: z.string() }),
  z.object({
    outcome: z.literal('redirect'),
    status: z.union([z.literal(301), z.literal(302)]),
    location: z.string(),
    ruleId: z.string(),
  }),
  z.object({ outcome: z.literal('gone'), ruleId: z.string() }),
  z.object({ outcome: z.literal('broken'), ruleId: z.string() }),
  z.object({ outcome: z.literal('loop'), ruleId: z.string() }),
  z.object({ outcome: z.literal('none') }),
]);
export type RedirectTestResult = z.infer<typeof redirectTestResultSchema>;

export const redirectImportRowSchema = z.object({
  line: z.number().int(),
  from: z.string(),
  to: z.string(),
  outcome: z.enum(['created', 'updated', 'unchanged', 'error']),
  side: z.enum(['file', 'source', 'target', 'site']).optional(),
  problem: z.string().optional(),
  detail: z.string().optional(),
});

export const redirectImportReportSchema = z.object({
  rows: z.array(redirectImportRowSchema),
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  failed: z.number().int(),
  truncated: z.boolean(),
  applied: z.boolean(),
});
export type RedirectImportReport = z.infer<typeof redirectImportReportSchema>;

/** An address visitors asked for and the site did not have. */
export const missingPathRecordSchema = z.object({
  id: z.string(),
  /** `/old/page`, or `/?p=123` for what a migrated site is asked at its front door. */
  path: z.string(),
  hits: z.number().int().nonnegative(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
});
export type MissingPathRecord = z.infer<typeof missingPathRecordSchema>;

export const paginatedMissingPathsSchema = z.object({
  items: z.array(missingPathRecordSchema),
  total: z.number(),
});
export type PaginatedMissingPaths = z.infer<typeof paginatedMissingPathsSchema>;

/** What the public site is told about an address its routes did not have. */
export const publicRedirectAnswerSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('redirect'),
    status: z.union([z.literal(301), z.literal(302)]),
    location: z.string(),
  }),
  z.object({ outcome: z.literal('gone') }),
]);
export type PublicRedirectAnswer = z.infer<typeof publicRedirectAnswerSchema>;
