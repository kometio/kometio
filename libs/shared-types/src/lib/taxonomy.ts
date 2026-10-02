import { z } from 'zod';
import { seoMetaSchema } from './content-model';

/**
 * A value that exists once per language, keyed by locale — a term's name
 * in Italian and in English are the same concept said twice, not two
 * pieces of content.
 *
 * A map rather than a translation table (ADR-0064): a term has no draft,
 * no published snapshot, no structure and no version history, so the
 * machinery `page_translations` carries would all be dead weight. A
 * missing locale is not an error either; the caller falls back the way
 * every other locale-keyed value in this codebase does.
 */
export const localizedTextSchema = z.record(z.string(), z.string());

export type LocalizedText = z.infer<typeof localizedTextSchema>;

/** A term or a dimension exists before it is named in every language; any name it does have is a better label than its id. */
export function firstNamed(name: LocalizedText): string {
  return Object.values(name).find((value) => value.trim() !== '') ?? '';
}

/** The same per-locale shape for the SEO block a term's route serves — `seoMetaSchema` is the one page translations already use, unchanged. */
export const localizedSeoMetaSchema = z.record(z.string(), seoMetaSchema);

export type LocalizedSeoMeta = z.infer<typeof localizedSeoMetaSchema>;
