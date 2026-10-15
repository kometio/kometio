import { z } from 'zod';
import { STARTER_IDS, STARTER_LANGUAGES } from '@kometio/shared-types';

export const starterIdSchema = z.enum(STARTER_IDS);
export const starterLanguageSchema = z.enum(STARTER_LANGUAGES);

/**
 * `GET /sites/:siteId/starters`: what a new site can be started from, and
 * whether this one still can (docs/adr/0136).
 */
export const starterOfferSchema = z.object({
  /** False once the site has something of its own: the screen is then not drawn. */
  available: z.boolean(),
  /** The language the starting points would be written in for this site. */
  language: starterLanguageSchema,
  /** True when the site's language is not one they are written in, so the screen can say so first. */
  fallback: z.boolean(),
  starters: z.array(starterIdSchema),
});
export type StarterOffer = z.infer<typeof starterOfferSchema>;

/** `POST /sites/:siteId/starters`: the one to make. The language is the site's. */
export const applyStarterBodySchema = z.object({
  starterId: starterIdSchema,
});
export type ApplyStarterBody = z.infer<typeof applyStarterBodySchema>;

export const applyStarterResponseSchema = z.object({
  starterId: starterIdSchema,
  language: starterLanguageSchema,
  fallback: z.boolean(),
  /** How many pages the site has now, the home page included. */
  pages: z.number().int().positive(),
});
export type ApplyStarterResponse = z.infer<typeof applyStarterResponseSchema>;
