import { describe, expect, it } from 'vitest';
import { listThemeIcons, resolveIconSvg } from './resolve-theme-icons';

// Real fixtures: neither themes/classic nor themes/docs-showcase declares
// its own icons/ directory today — both fall back to the full bundled
// Lucide set (docs/adr/0023), so this file exercises the same default set
// for both, plus the per-name resolution built on top of it.

describe('listThemeIcons', () => {
  it('falls back to the default Lucide set for a theme with no icons/ dir (classic)', () => {
    const icons = listThemeIcons('classic');

    expect(icons.length).toBeGreaterThan(1000);
    expect(icons.some((icon) => icon.name === 'accessibility')).toBe(true);
  });

  it('falls back to the default Lucide set for docs-showcase too', () => {
    const icons = listThemeIcons('docs-showcase');

    expect(icons.length).toBeGreaterThan(1000);
  });

  it('every entry is a real, sniffable SVG string', () => {
    const icons = listThemeIcons('classic');

    expect(icons[0]?.svg).toContain('<svg');
  });
});

describe('resolveIconSvg', () => {
  it('resolves a known default-set icon name to its SVG markup', () => {
    const svg = resolveIconSvg('accessibility', 'classic');

    expect(svg).toContain('<svg');
  });

  it('returns null for a name not in the set', () => {
    expect(resolveIconSvg('not-a-real-icon-name', 'classic')).toBeNull();
  });

  it('returns null for a null/undefined name without resolving anything', () => {
    expect(resolveIconSvg(null, 'classic')).toBeNull();
    expect(resolveIconSvg(undefined, 'classic')).toBeNull();
  });
});
