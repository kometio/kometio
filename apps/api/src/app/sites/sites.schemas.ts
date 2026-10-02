import { z } from 'zod';
import {
  businessAddressSchema,
  cookieBannerSettingsSchema,
  cssLengthSchema,
  localeSettingsSchema,
  openingHoursSchema,
  siteDomainSchema,
  themeSettingsSchema,
  updateThemeTokensBodySchema as sharedUpdateThemeTokensBodySchema,
} from '@kometio/shared-types';

export const updateBusinessInfoBodySchema = z.object({
  businessAddress: businessAddressSchema.nullable(),
  businessPhone: z.string().nullable(),
  // Checked here and not in the shared shape: a stored value has already
  // been through this, and a published page must not fail to render over
  // an address somebody typed before the rule existed.
  businessEmail: z.string().trim().email().nullable(),
  businessType: z.string().nullable(),
  openingHours: openingHoursSchema.nullable(),
});
export type UpdateBusinessInfoBody = z.infer<
  typeof updateBusinessInfoBodySchema
>;

// Same hostname validation as the public read path (public-pages.schemas.ts)
// — a site's own `domain` must be a plausible hostname for the exact same
// reason a request's Host header is validated there, just checked at write
// time here instead of read time.
export const updateGeneralSettingsBodySchema = z.object({
  name: z.string().min(1),
  domain: siteDomainSchema.nullable(),
});
export type UpdateGeneralSettingsBody = z.infer<
  typeof updateGeneralSettingsBodySchema
>;

export const updateSeoSettingsBodySchema = z.object({
  searchEngineIndexingEnabled: z.boolean(),
});
export type UpdateSeoSettingsBody = z.infer<typeof updateSeoSettingsBodySchema>;

// GDPR/privacy (piano-progetto-astro-cms.md's "Considerazioni aggiuntive").
// `null` keeps every submission forever; a number must be a whole number of
// days, at least 1 — "delete after 0 days" isn't a real retention policy,
// it's the delete-form-submissions feature wearing a disguise.
export const updateFormSubmissionRetentionBodySchema = z.object({
  formSubmissionRetentionDays: z.number().int().positive().nullable(),
});
export type UpdateFormSubmissionRetentionBody = z.infer<
  typeof updateFormSubmissionRetentionBodySchema
>;

// Reuses @kometio/shared-types' schema wholesale (docs/adr/0017) — it already
// encodes the one real invariant (defaultLocale must be one of
// enabledLocales), no reason to redeclare it here.
export const updateLocaleSettingsBodySchema = localeSettingsSchema;
export type UpdateLocaleSettingsBody = z.infer<
  typeof updateLocaleSettingsBodySchema
>;

// Reuses @kometio/shared-types' schema (docs/adr/0021) — same reasoning as
// locale settings above, the validation rules (hex color format) live once,
// shared between this write path and any future reader. The one thing added
// here is that a content width must be a real CSS length: the schema readers
// share stays lenient on it, so a value saved before this rule existed never
// stops a site from loading.
export const updateThemeSettingsBodySchema = themeSettingsSchema.extend({
  contentWidth: cssLengthSchema,
});
export type UpdateThemeSettingsBody = z.infer<
  typeof updateThemeSettingsBodySchema
>;

// Tier 2 selection (docs/adr/0021/0042) — which bundled theme renders this
// site. Whether `themeName` is actually one of this deployment's bundled
// themes is checked in the use-case against ThemeCatalogPort, not here —
// this schema only enforces the shape.
export const updateThemePackageBodySchema = z.object({
  themeName: z.string().min(1),
});
export type UpdateThemePackageBody = z.infer<
  typeof updateThemePackageBodySchema
>;

// Reuses @kometio/shared-types' schema wholesale — same reasoning as theme
// settings above (Global Styles Editor, Fase 2a del piano editor visuale
// parte 2).
export const updateThemeTokensBodySchema = sharedUpdateThemeTokensBodySchema;
export type UpdateThemeTokensBody = z.infer<typeof updateThemeTokensBodySchema>;

// Cookie consent banner config (docs/adr/0039) — inert config (no raw
// script), unlike theme-settings above, so this one has no @Roles('admin')
// gate on its controller endpoint.
export const updateCookieBannerSettingsBodySchema = cookieBannerSettingsSchema;
export type UpdateCookieBannerSettingsBody = z.infer<
  typeof updateCookieBannerSettingsBodySchema
>;

/**
 * How long a retention would be, in days, for the question "how many
 * answers would that delete". A whole number of days, as the retention is,
 * and bounded (a hundred years) so an absurd number cannot overflow the
 * interval the database builds from it.
 */
export const countFormSubmissionsQuerySchema = z.object({
  olderThanDays: z.coerce.number().int().min(1).max(36500),
});
export type CountFormSubmissionsQuery = z.infer<
  typeof countFormSubmissionsQuerySchema
>;
