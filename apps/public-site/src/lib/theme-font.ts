import { CURATED_THEME_FONTS } from '@kometio/shared-types';

export interface ResolvedThemeFont {
  /** The family[:wght@...] segment for the fonts.googleapis.com URL. */
  googleFontsFamily: string;
  /** The CSS font-family value, ready to assign to --font-sans-value. */
  cssFontFamily: string;
}

/**
 * Resolves an admin-picked font (docs/adr/0021 — a curated key, or a
 * free-text Google Fonts family name typed into the "custom" escape hatch)
 * into what PageLayout.astro needs to load it. `null` means "load nothing
 * external, don't override --font-sans-value" — covers both `fontFamily`
 * left unset (Tier 1 not touched) and the curated `system` choice, which
 * deliberately has no `googleFontsFamily` of its own.
 */
export function resolveThemeFont(
  fontFamily: string | null,
): ResolvedThemeFont | null {
  if (!fontFamily) return null;

  const curated = CURATED_THEME_FONTS.find((font) => font.value === fontFamily);
  if (curated) {
    if (!curated.googleFontsFamily) return null; // 'system'
    return {
      googleFontsFamily: curated.googleFontsFamily,
      cssFontFamily: `'${curated.label}', ui-sans-serif, system-ui, sans-serif`,
    };
  }

  // Free-text name: only letters, digits, spaces and hyphens survive —
  // every real Google Fonts family name is made of those, and this value
  // gets interpolated into a raw <style> block below, not passed through a
  // CSS-safe API, so anything else is stripped rather than trusted.
  const safeName = fontFamily.replace(/[^a-zA-Z0-9 -]/g, '').trim();
  if (!safeName) return null;
  return {
    googleFontsFamily: safeName.replace(/ /g, '+'),
    cssFontFamily: `'${safeName}', ui-sans-serif, system-ui, sans-serif`,
  };
}
