import { z } from 'zod';
import {
  MAX_TRACKER_SCRIPTS,
  trackerScriptEntrySchema,
} from './cookie-consent';
import { cssLengthTokenSchema } from './site-theme-tokens';

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color, e.g. #18181b');

/**
 * The fonts a site can choose in Style without bringing its own
 * (docs/adr/0021, docs/adr/0146). Every one of them is a file of the
 * product, served by the site from its own address: nothing is asked of a
 * font service, so a visitor's address goes nowhere it was not sent.
 *
 * `label` is the family name the stylesheet declares and the editor shows.
 * `system` has no file: it is the visitor's own interface font.
 */
export const CURATED_THEME_FONT_VALUES = [
  'system',
  'inter',
  'roboto',
  'poppins',
  'lora',
  'playfair-display',
  'jetbrains-mono',
] as const;

export type CuratedThemeFont = (typeof CURATED_THEME_FONT_VALUES)[number];

// A record and not a second list, so a value without a label does not compile.
const CURATED_THEME_FONT_LABELS: Record<CuratedThemeFont, string> = {
  system: 'System',
  inter: 'Inter',
  roboto: 'Roboto',
  poppins: 'Poppins',
  lora: 'Lora',
  'playfair-display': 'Playfair Display',
  'jetbrains-mono': 'JetBrains Mono',
};

export const CURATED_THEME_FONTS = CURATED_THEME_FONT_VALUES.map((value) => ({
  value,
  label: CURATED_THEME_FONT_LABELS[value],
}));

/** The family name a curated font is declared and shown under. */
export function curatedThemeFontLabel(value: CuratedThemeFont): string {
  return CURATED_THEME_FONT_LABELS[value];
}

export function isCuratedThemeFont(value: string): value is CuratedThemeFont {
  return CURATED_THEME_FONT_VALUES.some((font) => font === value);
}

/**
 * A font a site uploaded and draws its pages with (docs/adr/0147).
 *
 * Up to four files of one family: upright and italic, regular and bold, or
 * one variable file that holds every weight. `url` is the file's address as
 * the library serves it; the API sets it from `mediaId` on every save, so a
 * client can only point at a file this site already has.
 */
export const UPLOADED_FONT_WEIGHTS = [
  'variable',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
] as const;

export const uploadedFontFaceSchema = z.object({
  mediaId: z.string().uuid(),
  url: z.string().max(2048),
  weight: z.enum(UPLOADED_FONT_WEIGHTS),
  style: z.enum(['normal', 'italic']),
});
export type UploadedFontFace = z.infer<typeof uploadedFontFaceSchema>;

export const uploadedFontSchema = z.object({
  /**
   * The name the owner gave it, shown in the editor. Not the family the
   * stylesheet declares (that one is fixed, see the public site), so a name
   * can never collide with a theme's font or a curated one.
   */
  family: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(
      /^[\p{L}\p{N} '-]+$/u,
      'Letters, digits, spaces, hyphens and apostrophes only',
    ),
  faces: z
    .array(uploadedFontFaceSchema)
    .min(1)
    .max(4)
    .refine(
      (faces) =>
        new Set(faces.map((face) => `${face.weight} ${face.style}`)).size ===
        faces.length,
      'Two files of the font have the same weight and style',
    ),
});
export type UploadedFont = z.infer<typeof uploadedFontSchema>;

/** The files a site can draw with: the two web font containers (docs/adr/0147). */
export const WEB_FONT_MIME_TYPES: readonly string[] = [
  'font/woff2',
  'font/woff',
];

/** What the font menu in Style may hold: a curated font, or the one the site uploaded. */
export const THEME_FONT_CHOICES = [
  ...CURATED_THEME_FONT_VALUES,
  'uploaded',
] as const;
export type ThemeFontChoice = (typeof THEME_FONT_CHOICES)[number];

// Bare hostname, optional `*.` wildcard subdomain prefix, no scheme/path —
// CSP source-list shape (see content-security-policy.ts's own hardcoded
// origins for the pattern this mirrors). Always rendered with an assumed
// `https://` prefix at CSP-build time; never accept a scheme here so an
// admin can't smuggle `http://` (or anything else) into the header.
export const trackerDomainSchema = z
  .string()
  .regex(
    /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i,
    'Must be a bare domain, e.g. static.hotjar.com or *.hotjar.io — no https:// prefix, no path',
  );

export const trackerDomainEntrySchema = z.object({
  // For the admin's own reference in the list UI — never rendered into the
  // CSP header itself, just labels which vendor a domain belongs to.
  label: z.string().min(1).max(60),
  domain: trackerDomainSchema,
});
export type TrackerDomainEntry = z.infer<typeof trackerDomainEntrySchema>;
/** The list as the site's column holds it (docs/adr/0123). */
export const trackerDomainEntriesSchema = z.array(trackerDomainEntrySchema);

export const themeSettingsSchema = z.object({
  primaryColor: hexColorSchema.nullable(),
  secondaryColor: hexColorSchema.nullable(),
  /**
   * One of the fonts above, `uploaded` for the site's own, or `null` for the
   * theme's. Not a free name any more: a name could only be looked up at a
   * font service, and that is what this field no longer does
   * (docs/adr/0146, docs/adr/0147).
   */
  fontFamily: z.enum(THEME_FONT_CHOICES).nullable(),
  /** The font the site uploaded (docs/adr/0147), kept while another is picked so that picking it again costs nothing. */
  uploadedFont: uploadedFontSchema.nullable(),
  customCss: z.string().nullable(),
  /**
   * How wide the readable content column is on this site (ADR-0049), or
   * `null` to keep the active theme's own number.
   *
   * `cssLengthTokenSchema` rather than a bare string, and deliberately
   * reused rather than reinvented: this value is interpolated into a
   * `--kometio-content-width` declaration in a `<style>` on every page, the
   * exact position PR #144 found a full-page overlay could be injected
   * from. Whatever guards a block override's length has to guard this one.
   *
   * Gated by `overridesEnabled` below like every other field here, and
   * that is the intended reading: turning the switch off means "show me
   * the theme's own look", and the theme's own column width is part of
   * it. What the switch must NOT collapse is a block's own `align` — see
   * the note on `Block.align` for why that is a field of the block rather
   * than a style property.
   */
  contentWidth: cssLengthTokenSchema,
  headScript: z.string().nullable(),
  bodyScript: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  // Two-gate composition (docs/adr/0021): a theme's own theme.json
  // `allowStyleOverrides` is the ceiling a site can never raise past — this
  // flag is the day-to-day switch *below* that ceiling, controlled by
  // whoever edits Site settings. Both must allow overrides for any Tier 1
  // field above to actually render; either one being false means "ignore
  // everything in this object except this flag itself".
  overridesEnabled: z.boolean(),
  /**
   * Whether the site moves at all (docs/adr/0141): the parts of its blocks
   * arriving in turn, what its controls do under the pointer, the cross-fade
   * between pages, and the entrances somebody set on a block. `false` is the
   * owner saying "no motion on this site", whatever the theme and the visitor's
   * system say — a visitor who asked their system for less is answered
   * either way. Not part of the Tier 1 gate above: a site that turned motion
   * off has not asked to see the theme's own look, it has asked for stillness,
   * and a theme author's ceiling on colours is no reason to ignore that.
   */
  motionEnabled: z.boolean(),
  // ADR-0031's tracker whitelist: domains a site owner's own head/body
  // script needs to talk to beyond the hardcoded GTM/GA4/Meta Pixel
  // allowlist (content-security-policy.ts). Capped well above any realistic
  // legitimate use so the CSP header itself can't grow unbounded.
  allowedTrackerDomains: z.array(trackerDomainEntrySchema).max(20),
  // Cookie consent (docs/adr/0039): categorized tracker snippets, gated by
  // consent category at render time (apps/public-site/src/lib/consent-script-blocking.ts)
  // — separate from the always-on headScript/bodyScript above, and from
  // allowedTrackerDomains (a CSP allowlist, not a gating mechanism).
  trackerScripts: z.array(trackerScriptEntrySchema).max(MAX_TRACKER_SCRIPTS),
});
export type ThemeSettings = z.infer<typeof themeSettingsSchema>;
