import { describe, expect, it } from 'vitest';
import { resolveThemeFont } from './theme-font';

describe('resolveThemeFont', () => {
  it('returns null when no font is set (Tier 1 not touched)', () => {
    expect(resolveThemeFont(null)).toBeNull();
  });

  it("returns null for the curated 'system' choice — no external font to load", () => {
    expect(resolveThemeFont('system')).toBeNull();
  });

  it('resolves a curated font to its Google Fonts family and CSS value', () => {
    expect(resolveThemeFont('inter')).toEqual({
      googleFontsFamily: 'Inter:wght@400;500;600;700',
      cssFontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    });
  });

  it('resolves a free-text Google Fonts name, replacing spaces with +', () => {
    expect(resolveThemeFont('Space Grotesk')).toEqual({
      googleFontsFamily: 'Space+Grotesk',
      cssFontFamily: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
    });
  });

  it('strips anything that is not a letter, digit, space, or hyphen from a free-text name', () => {
    const result = resolveThemeFont('IBM Plex Mono<script>alert(1)</script>');
    expect(result?.cssFontFamily).toBe(
      "'IBM Plex Monoscriptalert1script', ui-sans-serif, system-ui, sans-serif",
    );
  });

  it('returns null when a free-text name is empty after sanitization', () => {
    expect(resolveThemeFont('!!!')).toBeNull();
  });
});
