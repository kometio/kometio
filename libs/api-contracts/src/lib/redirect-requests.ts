import { z } from 'zod';
import { REDIRECT_LIMITS } from '@kometio/shared-types';
import { redirectStatusSchema } from './redirect-record';

const address = z.string().trim().min(1).max(REDIRECT_LIMITS.addressLength);

/** Where to: a page chosen, or an address typed. */
export const redirectTargetBodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('page'),
    pageGroupId: z.string().uuid(),
    locale: z.string().min(1).max(35),
  }),
  z.object({ kind: z.literal('url'), url: address }),
]);

export const createRedirectBodySchema = z.object({
  siteId: z.string().uuid(),
  /** The old address, as pasted: a whole link, a path, `?p=123`, a pattern. */
  from: address,
  /** Absent for a rule that says the address is gone (`status` 410). */
  to: redirectTargetBodySchema.nullable().default(null),
  status: redirectStatusSchema.default(301),
});
export type CreateRedirectBody = z.infer<typeof createRedirectBodySchema>;

export const updateRedirectBodySchema = z.object({
  from: address.optional(),
  to: redirectTargetBodySchema.nullable().default(null),
  status: redirectStatusSchema.default(301),
});
export type UpdateRedirectBody = z.infer<typeof updateRedirectBodySchema>;

export const listRedirectsQuerySchema = z.object({
  siteId: z.string().uuid(),
  search: z.string().trim().max(200).optional(),
  origin: z.enum(['manual', 'list', 'wordpress']).optional(),
  needsATarget: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListRedirectsQuery = z.infer<typeof listRedirectsQuerySchema>;

export const importRedirectsBodySchema = z.object({
  siteId: z.string().uuid(),
  /** The file's text. 2 MB is some forty thousand lines: more than a site holds. */
  csv: z.string().max(2_000_000),
  dryRun: z.boolean().default(false),
});
export type ImportRedirectsBody = z.infer<typeof importRedirectsBodySchema>;

export const testRedirectBodySchema = z.object({
  siteId: z.string().uuid(),
  address,
});
export type TestRedirectBody = z.infer<typeof testRedirectBodySchema>;

export const listMissingPathsQuerySchema = z.object({
  siteId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMissingPathsQuery = z.infer<typeof listMissingPathsQuerySchema>;

/** What the public site asks: the host, and what the visitor asked for. */
export const publicRedirectQuerySchema = z.object({
  domain: z.string().trim().min(1).max(253),
  path: z.string().max(REDIRECT_LIMITS.addressLength),
  search: z.string().max(1000).default(''),
});
export type PublicRedirectQuery = z.infer<typeof publicRedirectQuerySchema>;
