import { z } from 'zod';
import {
  businessInfoSchema,
  cookieBannerSettingsSchema,
  cssLengthTokenSchema,
  hexColorSchema,
  themeTokensSchema,
  trackerDomainEntrySchema,
  trackerScriptEntrySchema,
  untranslatedPageFallbackSchema,
} from '@kometio/shared-types';

/**
 * The full site record as the editor CRUD surface sees it (`GET /sites/:id`
 * and every `PATCH /sites/:id/*` response) — unlike `PublishedSite`, this
 * includes the row's own id/tenantId, the raw Tier 1 theme fields (not yet
 * grouped into `ThemeSettings`, see `SitesController.toDto`), and
 * `createdAt`. Shared between `apps/api`'s `SitesController` (server-side
 * shape) and `apps/editor-app`'s `sites-api-client.ts` (parses it off the
 * wire) — same reasoning as `publishedSiteSchema`.
 */
export const siteRecordSchema = businessInfoSchema.extend({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  domain: z.string().nullable(),
  // Tier 2 selection (docs/adr/0021/0042) — which bundled filesystem theme
  // renders this site, distinct from the Tier 1 `theme*` style overrides
  // below.
  themeName: z.string(),
  defaultLocale: z.string(),
  enabledLocales: z.array(z.string()),
  untranslatedPageFallback: untranslatedPageFallbackSchema,
  searchEngineIndexingEnabled: z.boolean(),
  // GDPR/privacy: `null` keeps every form_submissions row forever.
  formSubmissionRetentionDays: z.number().int().positive().nullable(),
  themePrimaryColor: hexColorSchema.nullable(),
  themeSecondaryColor: hexColorSchema.nullable(),
  themeFontFamily: z.string().nullable(),
  themeCustomCss: z.string().nullable(),
  // ADR-0049 — same guarded CSS length the Tier 1 settings schema uses, not
  // a bare string: it is interpolated into a stylesheet on every page.
  themeContentWidth: cssLengthTokenSchema,
  themeHeadScript: z.string().nullable(),
  themeBodyScript: z.string().nullable(),
  themeFaviconUrl: z.string().nullable(),
  themeOverridesEnabled: z.boolean(),
  themeAllowedTrackerDomains: z.array(trackerDomainEntrySchema),
  themeTrackerScripts: z.array(trackerScriptEntrySchema),
  cookieBannerSettings: cookieBannerSettingsSchema,
  themeTokens: themeTokensSchema,
  // Date over the wire, always an ISO string — never revived to a Date on
  // the client (see http-client.ts's plain JSON.parse).
  createdAt: z.string(),
});

export type SiteRecord = z.infer<typeof siteRecordSchema>;
