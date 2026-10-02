import { z } from 'zod';

/**
 * What a visitor sees when they land on a locale-prefixed URL for a page
 * that has no translation in that locale (Fase 5b — multilingua):
 * 'redirect-to-default' sends them to the default locale's version of the
 * same page; 'not-available' shows a dedicated "not yet available in this
 * language" state instead of silently switching language on them.
 */
export const UNTRANSLATED_PAGE_FALLBACKS = [
  'redirect-to-default',
  'not-available',
] as const;
export const untranslatedPageFallbackSchema = z.enum(
  UNTRANSLATED_PAGE_FALLBACKS,
);
export type UntranslatedPageFallback =
  (typeof UNTRANSLATED_PAGE_FALLBACKS)[number];

export const localeSettingsSchema = z
  .object({
    defaultLocale: z.string().min(2),
    enabledLocales: z.array(z.string().min(2)).min(1),
    untranslatedPageFallback: untranslatedPageFallbackSchema,
  })
  // The default locale is meaningless if it isn't itself one of the
  // enabled locales — every new page (see use-pages-list.ts) is created in
  // whatever locale is "default", so it must always resolve to a real,
  // enabled option.
  .refine((value) => value.enabledLocales.includes(value.defaultLocale), {
    message: 'defaultLocale must be one of enabledLocales',
    path: ['defaultLocale'],
  });
export type LocaleSettings = z.infer<typeof localeSettingsSchema>;
