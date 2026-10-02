import { z } from 'zod';
import {
  PAGE_GENERATION_FAILURES,
  PAGE_GENERATOR_PROVIDERS,
  pageContentSchema,
} from '@kometio/shared-types';

/**
 * What the settings screen sends. `apiKey` absent keeps the stored key,
 * `null` removes it, a string replaces it; the key itself is never sent
 * back (see siteAiSettingsViewSchema).
 */
export const siteAiSettingsInputSchema = z
  .object({
    provider: z.enum(PAGE_GENERATOR_PROVIDERS),
    model: z.string().trim().min(1).max(200),
    baseUrl: z
      .string()
      .trim()
      .max(500)
      .refine(
        (value) => /^https?:\/\/[^\s]+$/.test(value),
        'An http(s) address.',
      )
      // A token in the address would be stored and shown in the clear,
      // beside a key field that seals it: it goes in the key field.
      .refine(
        (value) => !/^https?:\/\/[^/?#]*@/.test(value),
        'No user or password in the address: put the key in the API key field.',
      )
      .nullable(),
    apiKey: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .refine(
    (input) => input.provider !== 'openai-compatible' || input.baseUrl !== null,
    {
      path: ['baseUrl'],
      message: 'An OpenAI-compatible server needs its address.',
    },
  );

export type SiteAiSettingsInput = z.infer<typeof siteAiSettingsInputSchema>;

/**
 * What the settings screen is shown: never the key. `apiKeyHint` is its
 * last four characters, `''` when a key is saved that is too short to
 * show any of without giving most of it away, `null` when there is none.
 */
export const siteAiSettingsViewSchema = z.object({
  configured: z.boolean(),
  provider: z.enum(PAGE_GENERATOR_PROVIDERS).nullable(),
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  apiKeyHint: z.string().nullable(),
});

export type SiteAiSettingsView = z.infer<typeof siteAiSettingsViewSchema>;

/** What the editor sends to generate a page. */
export const generatePageRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  /** The page's language; the copy is written in it. */
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
  /** For adding to a page that has content: its outline, top level. */
  existingOutline: z.array(z.string().max(200)).max(60).optional(),
});

export type GeneratePageRequest = z.infer<typeof generatePageRequestSchema>;

/** What the settings screen reads: the view, and whether this deployment can store a key at all. */
export const siteAiSettingsResponseSchema = siteAiSettingsViewSchema.extend({
  enabled: z.boolean(),
});

export type SiteAiSettingsResponse = z.infer<
  typeof siteAiSettingsResponseSchema
>;

/**
 * The events `POST /sites/:id/generate-page` streams: progress while the
 * provider writes, then the page or the reason there is none.
 */
export const generatePageEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('progress'),
    data: z.object({ received: z.number().int().nonnegative() }),
  }),
  z.object({
    event: z.literal('done'),
    data: z.object({
      content: pageContentSchema,
      /** Blocks the model wrote that could not be kept, and why; the editor says how many. */
      dropped: z.array(
        z.object({
          ref: z.string().nullable(),
          type: z.string().nullable(),
          reason: z.string(),
        }),
      ),
      placeholderCount: z.number().int().nonnegative(),
      model: z.string(),
    }),
  }),
  z.object({
    event: z.literal('error'),
    data: z.object({ failure: z.enum(PAGE_GENERATION_FAILURES) }),
  }),
]);

export type GeneratePageEvent = z.infer<typeof generatePageEventSchema>;

/**
 * The body of a generation refused before its stream opens (409): the
 * failure's code as the message, the code an `error` event carries.
 */
export const pageGenerationRefusalSchema = z.object({
  message: z.enum(PAGE_GENERATION_FAILURES),
});

/**
 * Whether pages can be generated here, for everyone who edits them — not
 * only the admins who can read the settings: `server-disabled` when this
 * installation has no secrets key, `not-configured` when the site has no
 * provider yet.
 */
export const PAGE_GENERATION_AVAILABILITY = [
  'ready',
  'not-configured',
  'server-disabled',
] as const;

export const pageGenerationStatusSchema = z.object({
  availability: z.enum(PAGE_GENERATION_AVAILABILITY),
});

export type PageGenerationStatus = z.infer<typeof pageGenerationStatusSchema>;
