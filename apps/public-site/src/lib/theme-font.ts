import {
  curatedThemeFontLabel,
  isCuratedThemeFont,
  type UploadedFont,
  type UploadedFontFace,
} from '@kometio/shared-types';
import { siteFontUrl } from './site-font-url';

export interface ResolvedThemeFont {
  /** The CSS font-family value, ready to assign to --font-sans-value. */
  cssFontFamily: string;
  /**
   * `@font-face` rules the page has to carry, or `''`. Only an uploaded font
   * has any: a curated one is declared by its `fonts.css`, bundled with the
   * themes' fonts (theme-fonts.ts).
   */
  fontFaceCss: string;
}

const SYSTEM_FONT_STACK = 'ui-sans-serif, system-ui, sans-serif';

/**
 * The family an uploaded font is declared under. Fixed, and not the name the
 * owner gave it: that name could be a theme's family or a curated one, and
 * two `@font-face` sets under one name are merged by the browser, file by
 * file.
 */
export const UPLOADED_FONT_FAMILY = 'kometio-uploaded-font';

function uploadedFontFace(face: UploadedFontFace): string {
  const weight = face.weight === 'variable' ? '100 900' : face.weight;
  return `@font-face { font-family: '${UPLOADED_FONT_FAMILY}'; font-style: ${face.style}; font-weight: ${weight}; font-display: swap; src: url("${siteFontUrl(face.url)}"); }`;
}

/**
 * The font a site chose in Style (docs/adr/0021, docs/adr/0146,
 * docs/adr/0147) as the value of `--font-sans-value`, or `null` to leave the
 * theme's own.
 *
 * `system` is the visitor's own interface font. `uploaded` is the font the
 * site uploaded, served from the site's own address (`/api/site-font`). A
 * value that is not one of these gives `null`: the field used to take any
 * Google Fonts name, and a site that typed one goes back to its theme's font.
 */
export function resolveThemeFont(
  fontFamily: string | null,
  uploadedFont: UploadedFont | null = null,
): ResolvedThemeFont | null {
  if (fontFamily === 'uploaded') {
    if (!uploadedFont) return null;
    return {
      cssFontFamily: `'${UPLOADED_FONT_FAMILY}', ${SYSTEM_FONT_STACK}`,
      fontFaceCss: uploadedFont.faces.map(uploadedFontFace).join('\n'),
    };
  }
  if (!fontFamily || !isCuratedThemeFont(fontFamily)) return null;
  if (fontFamily === 'system') {
    return { cssFontFamily: SYSTEM_FONT_STACK, fontFaceCss: '' };
  }
  return {
    cssFontFamily: `'${curatedThemeFontLabel(fontFamily)}', ${SYSTEM_FONT_STACK}`,
    fontFaceCss: '',
  };
}
