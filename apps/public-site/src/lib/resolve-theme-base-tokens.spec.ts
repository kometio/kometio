import { describe, expect, it } from 'vitest';
import { resolveThemeBaseTokens } from './resolve-theme-base-tokens';

// Real values from themes/classic/theme.css and themes/docs-showcase/theme.css.

describe('resolveThemeBaseTokens', () => {
  it("resolves classic's own base tokens", () => {
    expect(resolveThemeBaseTokens('classic')).toEqual({
      primary: 'oklch(0.42 0.08 160)',
      secondary: 'oklch(0.95 0.008 120)',
      // Must match the @font-face name its fonts.css declares exactly.
      fontSansValue: "'Manrope Variable', ui-sans-serif, system-ui, sans-serif",
      radius: '0.75rem',
      // The rest of the colour vocabulary, for the picker's theme
      // swatches (ADR-0050) — read from the same `:root` as the four
      // above, so a theme that renames one loses a swatch here rather
      // than silently offering a colour that resolves to nothing.
      background: 'oklch(0.985 0.003 100)',
      foreground: 'oklch(0.21 0.012 150)',
      muted: 'oklch(0.95 0.008 120)',
      mutedForeground: 'oklch(0.47 0.02 150)',
      border: 'oklch(0.89 0.012 120)',
      // Core's `--link` (the theme states none), followed to the colour it
      // names: the editor paints the swatch with it, and `var(--primary)`
      // there would be the editor's own blue.
      link: 'oklch(0.42 0.08 160)',
    });
  });

  it("resolves docs-showcase's own, different base tokens", () => {
    expect(resolveThemeBaseTokens('docs-showcase')).toEqual({
      primary: 'oklch(0.5 0.12 250)',
      secondary: 'oklch(0.96 0.008 250)',
      // Must match the @font-face name fonts.css declares exactly —
      // Geist's variable font is 'Geist Variable'.
      fontSansValue: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
      radius: '0.5rem',
      background: 'oklch(0.99 0.003 250)',
      foreground: 'oklch(0.2 0.02 255)',
      muted: 'oklch(0.96 0.008 250)',
      mutedForeground: 'oklch(0.48 0.02 255)',
      border: 'oklch(0.9 0.01 250)',
      link: 'oklch(0.5 0.12 250)',
    });
  });

  it('falls back to a bundled theme for an unknown theme name', () => {
    expect(resolveThemeBaseTokens('not-a-real-theme')).toEqual(
      resolveThemeBaseTokens('classic'),
    );
  });
});
