import { describe, expect, it } from 'vitest';
import {
  checkContrastAgainstThemeForeground,
  oklchToHex,
} from './color-contrast';

describe('oklchToHex', () => {
  const channels = (hex: string | null) =>
    hex ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : [];

  it('gives white and black for the two ends of the lightness axis', () => {
    expect(oklchToHex('oklch(1 0 0)')).toBe('#ffffff');
    expect(oklchToHex('oklch(0 0 0)')).toBe('#000000');
  });

  it('gives sRGB red for the oklch written for it (within a rounding step)', () => {
    const [r, g, b] = channels(oklchToHex('oklch(0.628 0.2577 29.23)'));
    expect(r).toBeGreaterThanOrEqual(253);
    expect(g).toBeLessThanOrEqual(3);
    expect(b).toBeLessThanOrEqual(3);
  });

  it('puts a colour outside sRGB on its nearest edge instead of failing', () => {
    expect(oklchToHex('oklch(0.7 0.4 150)')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('agrees with the contrast check: the hex it gives is as readable as the oklch was', () => {
    const fromOklch = checkContrastAgainstThemeForeground(
      '#ffffff',
      'oklch(0.3 0.05 260)',
    );
    const hex = oklchToHex('oklch(0.3 0.05 260)');
    const fromHex = hex && checkContrastAgainstThemeForeground('#ffffff', hex);
    expect(
      fromHex && fromOklch && Math.abs(fromHex.ratio - fromOklch.ratio),
    ).toBeLessThan(0.3);
  });

  it('is null for anything that is not an oklch colour', () => {
    expect(oklchToHex('#ffffff')).toBeNull();
    expect(oklchToHex('banana')).toBeNull();
    expect(oklchToHex('')).toBeNull();
  });
});

describe('checkContrastAgainstThemeForeground', () => {
  it('gives the well-known 21:1 ratio for pure white vs pure black', () => {
    const result = checkContrastAgainstThemeForeground('#ffffff', '#000000');

    expect(result?.ratio).toBeCloseTo(21, 1);
    expect(result?.passesAA).toBe(true);
  });

  it('gives a 1:1 ratio for a color against itself', () => {
    const result = checkContrastAgainstThemeForeground('#3366cc', '#3366cc');

    expect(result?.ratio).toBeCloseTo(1, 5);
    expect(result?.passesAA).toBe(false);
  });

  it('is case-insensitive for hex input', () => {
    const result = checkContrastAgainstThemeForeground('#FFFFFF', '#000000');

    expect(result?.ratio).toBeCloseTo(21, 1);
  });

  it('parses an oklch(...) foreground token (the format the active theme actually uses)', () => {
    // themes/classic/theme.css: --primary-foreground: oklch(0.985 0 0),
    // a near-white achromatic color — should read almost like pure white.
    const result = checkContrastAgainstThemeForeground(
      '#000000',
      'oklch(0.985 0 0)',
    );

    expect(result?.ratio).toBeGreaterThan(19);
    expect(result?.passesAA).toBe(true);
  });

  it('flags a light background against a near-white theme foreground as failing AA', () => {
    // A real risk this check exists for: a light/pastel primaryColor
    // picked by a site owner, paired with the theme's fixed near-white
    // --primary-foreground (oklch(0.985 0 0)) — both light, unreadable.
    const result = checkContrastAgainstThemeForeground(
      '#fffacd',
      'oklch(0.985 0 0)',
    );

    expect(result?.passesAA).toBe(false);
    expect(result?.ratio).toBeLessThan(4.5);
  });

  it('flags a dark-but-not-dark-enough background against a near-black theme foreground', () => {
    // Mirrors the case above for the other extreme: --secondary-foreground
    // (oklch(0.205 0 0), near-black) paired with a background that's dark
    // but still too close in luminance to read clearly.
    const result = checkContrastAgainstThemeForeground(
      '#4d4d4d',
      'oklch(0.205 0 0)',
    );

    expect(result?.passesAA).toBe(false);
    expect(result?.ratio).toBeLessThan(4.5);
  });

  it('passes for a properly dark background against a near-white theme foreground', () => {
    const result = checkContrastAgainstThemeForeground(
      '#1a1a2e',
      'oklch(0.985 0 0)',
    );

    expect(result?.passesAA).toBe(true);
  });

  it('returns null for an unrecognized background color format', () => {
    expect(
      checkContrastAgainstThemeForeground('red', 'oklch(0.985 0 0)'),
    ).toBeNull();
  });

  it('returns null for an unrecognized (unresolved) foreground token', () => {
    expect(
      checkContrastAgainstThemeForeground(
        '#ffffff',
        'var(--primary-foreground)',
      ),
    ).toBeNull();
  });
});
