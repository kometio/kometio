import { z } from 'zod';

/**
 * GDPR consent categories (docs/adr/0039), matching iubenda's own four —
 * chosen deliberately over a shorter/longer list so the concepts already
 * map onto what most site owners have seen before. `necessary` exists in
 * this enum so a tracker script CAN be tagged with it, but it is never a
 * togglable row in the banner UI and is always treated as granted — it's
 * the "no gating at all" category, not a fifth real choice.
 */
export const CONSENT_CATEGORIES = [
  'necessary',
  'functionality',
  'measurement',
  'experience',
] as const;
export const consentCategorySchema = z.enum(CONSENT_CATEGORIES);
export type ConsentCategory = z.infer<typeof consentCategorySchema>;

export const trackerScriptPlacementSchema = z.enum(['head', 'body']);
export type TrackerScriptPlacement = z.infer<
  typeof trackerScriptPlacementSchema
>;

/**
 * One categorized tracker snippet — the structured alternative to the
 * legacy free-text `themeHeadScript`/`themeBodyScript` fields (which have
 * no per-snippet boundary, so nothing inside them can be gated by
 * category). Populated either by an admin adding an entry directly in
 * Integrazioni, or automatically by `tracker-signature-detector.ts` when
 * it recognizes a known vendor inside the legacy free-text fields.
 */
export const trackerScriptEntrySchema = z.object({
  id: z.string(),
  // For the admin's own reference in the list UI, e.g. "Google Analytics".
  label: z.string().min(1).max(60),
  category: consentCategorySchema,
  placement: trackerScriptPlacementSchema,
  html: z.string().min(1),
});
export type TrackerScriptEntry = z.infer<typeof trackerScriptEntrySchema>;
// Same cap as themeAllowedTrackerDomains — see site-theme-settings.ts.
export const MAX_TRACKER_SCRIPTS = 20;

export const cookieBannerPositionSchema = z.enum([
  'bottom-bar',
  'bottom-left',
  'bottom-right',
  'center-modal',
]);
export type CookieBannerPosition = z.infer<typeof cookieBannerPositionSchema>;

export const cookieBannerReopenPositionSchema = z.enum([
  'bottom-left',
  'bottom-right',
]);
export type CookieBannerReopenPosition = z.infer<
  typeof cookieBannerReopenPositionSchema
>;

/**
 * Per-locale copy override for the banner's own strings — optional on
 * purpose, every field falls back to the built-in public-site dictionary
 * (apps/public-site/src/locales/*.json) when absent. Needed because a site
 * can enable any locale (e.g. `fr`) but the built-in dictionary only ships
 * it/en.
 */
export const cookieBannerCopySchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(2000).optional(),
  acceptAll: z.string().max(60).optional(),
  rejectAll: z.string().max(60).optional(),
  customize: z.string().max(60).optional(),
});
export type CookieBannerCopy = z.infer<typeof cookieBannerCopySchema>;

export const cookieBannerSettingsSchema = z.object({
  enabled: z.boolean(),
  position: cookieBannerPositionSchema,
  // Which side the primary "accept" action sits on — default left, per the
  // site-wide default the user asked for.
  acceptButtonSide: z.enum(['left', 'right']),
  showReopenTab: z.boolean(),
  reopenPosition: cookieBannerReopenPositionSchema,
  // Page group ids, not URLs, so a slug rename never breaks the banner's
  // own links — resolved to this locale's slug in resolve-site-chrome.ts.
  privacyPolicyPageGroupId: z.string().nullable(),
  cookiePolicyPageGroupId: z.string().nullable(),
  copyOverrides: z.record(z.string(), cookieBannerCopySchema),
});
export type CookieBannerSettings = z.infer<typeof cookieBannerSettingsSchema>;

// `enabled: false` — an existing site never gains a banner it didn't ask
// for just because this feature shipped.
export const DEFAULT_COOKIE_BANNER_SETTINGS: CookieBannerSettings = {
  enabled: false,
  position: 'bottom-bar',
  acceptButtonSide: 'left',
  showReopenTab: true,
  reopenPosition: 'bottom-left',
  privacyPolicyPageGroupId: null,
  cookiePolicyPageGroupId: null,
  copyOverrides: {},
};

/**
 * The shape of the `kometio_consent` first-party cookie
 * (apps/public-site/src/components/cookie-consent-bootstrap.ts), and of
 * `window.kometioConsent`'s runtime API — shared here so both the bootstrap
 * script's TS source and CookieConsent.astro's own UI script (and its
 * tests) reference one definition instead of two hand-copied shapes.
 */
export interface ConsentRecord {
  v: 1;
  // Minimum viable proof-of-consent token, shown in the preferences panel
  // — not a server-side ledger entry (docs/adr/0039, deferred to v1
  // follow-up).
  id: string;
  ts: string;
  cats: {
    functionality: boolean;
    measurement: boolean;
    experience: boolean;
  };
}

export interface KometioConsentApi {
  get(): ConsentRecord | null;
  has(category: ConsentCategory): boolean;
  apply(prefs: {
    functionality: boolean;
    measurement: boolean;
    experience: boolean;
  }): void;
  openPreferences(): void;
}
