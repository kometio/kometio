import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURATED_THEME_FONTS } from '@kometio/shared-types';
import { resolveThemeFont } from './theme-font';

const FONTS_DIR = join(import.meta.dirname, '../fonts');
const FILE_FONTS = CURATED_THEME_FONTS.filter(
  (font) => font.value !== 'system',
);

describe('resolveThemeFont', () => {
  it('leaves the theme’s font when no font is set', () => {
    expect(resolveThemeFont(null)).toBeNull();
  });

  it('leaves the theme’s font for a name that is not one of the curated fonts (the old free-text field)', () => {
    expect(resolveThemeFont('Space Grotesk')).toBeNull();
  });

  it('draws the system choice with the visitor’s own interface font', () => {
    expect(resolveThemeFont('system')).toEqual({
      cssFontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontFaceCss: '',
    });
  });

  it('draws a curated font by the family its stylesheet declares', () => {
    expect(resolveThemeFont('playfair-display')).toEqual({
      cssFontFamily: "'Playfair Display', ui-sans-serif, system-ui, sans-serif",
      fontFaceCss: '',
    });
  });

  // docs/adr/0147
  describe('a font the site uploaded', () => {
    const font = {
      family: 'Biscotto', // the owner's name: never written into the stylesheet
      faces: [
        {
          mediaId: '00000000-0000-4000-8000-000000000001',
          url: 'https://api.example.test/uploads/a.woff2',
          weight: 'variable' as const,
          style: 'normal' as const,
        },
        {
          mediaId: '00000000-0000-4000-8000-000000000002',
          url: 'https://api.example.test/uploads/b.woff2',
          weight: '700' as const,
          style: 'italic' as const,
        },
      ],
    };

    it('draws with one face per file, from the site’s own address', () => {
      const resolved = resolveThemeFont('uploaded', font);

      expect(resolved?.cssFontFamily).toBe(
        "'kometio-uploaded-font', ui-sans-serif, system-ui, sans-serif",
      );
      const faces = resolved?.fontFaceCss.split('\n') ?? [];
      expect(faces).toHaveLength(2);
      expect(faces[0]).toContain('font-weight: 100 900;');
      expect(faces[0]).toContain('font-style: normal;');
      expect(faces[0]).toContain(
        'url("/api/site-font?href=https%3A%2F%2Fapi.example.test%2Fuploads%2Fa.woff2")',
      );
      expect(faces[1]).toContain('font-weight: 700;');
      expect(faces[1]).toContain('font-style: italic;');
      expect(resolved?.fontFaceCss).not.toContain('Biscotto');
    });

    it('leaves the theme’s font when there is no uploaded font to draw with', () => {
      expect(resolveThemeFont('uploaded', null)).toBeNull();
    });
  });
});

/*
 * The other half of the contract: the family the page asks for is one the
 * site declares, from files it has. A font whose stylesheet is missing, or
 * that names its family differently, fails silently on the page (the browser
 * falls through to the next font), so it fails here instead.
 */
describe.each(FILE_FONTS)('the site’s own $label', ({ value, label }) => {
  // Whitespace folded: the formatter breaks a long unicode-range over lines.
  const css = readFileSync(join(FONTS_DIR, value, 'fonts.css'), 'utf8').replace(
    /\s+/g,
    ' ',
  );
  const faces = css.match(/@font-face \{[^}]*\}/g) ?? [];

  it('declares the family the resolver names, upright and italic, Latin and the rest of Europe', () => {
    expect(faces.length).toBeGreaterThanOrEqual(4);
    expect(
      faces.every((face) => face.includes(`font-family: '${label}';`)),
    ).toBe(true);
    expect(css).toContain('font-style: normal');
    expect(css).toContain('font-style: italic');
    expect(css).toContain('unicode-range: U+0000-00FF');
    expect(css).toContain('unicode-range: U+0100-02BA');
  });

  it('loads every face from a file beside it, and from nowhere else', () => {
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map(
      (match) => match[1],
    );
    expect(urls).toHaveLength(faces.length);
    for (const url of urls) {
      expect(url).toMatch(/^\.\/[a-z0-9-]+\.woff2$/);
      expect(existsSync(join(FONTS_DIR, value, url ?? ''))).toBe(true);
    }
  });

  it('carries its licence', () => {
    expect(readFileSync(join(FONTS_DIR, value, 'OFL.txt'), 'utf8')).toContain(
      'SIL Open Font License',
    );
  });
});
