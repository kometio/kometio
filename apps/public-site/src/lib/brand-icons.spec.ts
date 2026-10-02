import { describe, expect, it } from 'vitest';
import { listThemeIcons, resolveIconSvg } from './resolve-theme-icons';

/*
 * Lucide removed brand logos from its set — 2034 icons and not one of
 * Facebook, Instagram, YouTube or WhatsApp — so a second package supplies
 * them (ADR-0053). These pin the three things that decision depends on.
 */
describe('brand icons', () => {
  const brands = listThemeIcons('classic', 'brand');
  const interfaceIcons = listThemeIcons('classic', 'interface');

  it('supplies the logos the interface set does not have', () => {
    for (const name of ['facebook', 'instagram', 'youtube', 'whatsapp']) {
      expect(
        interfaceIcons.some((icon) => icon.name === name),
        `${name} unexpectedly present in the interface set`,
      ).toBe(false);
      expect(
        brands.some((icon) => icon.name === `brand:${name}`),
        `brand:${name} missing`,
      ).toBe(true);
    }
  });

  it('keeps the two sets from colliding, which they do on 34 names', () => {
    // `apple`, `box`, `circle`, `bitcoin`… mean different pictures in the
    // two sets, and an icon's name is stored in page content — so it has
    // to keep meaning the same picture forever.
    const interfaceNames = new Set(interfaceIcons.map((icon) => icon.name));
    const collisions = brands.filter((icon) => interfaceNames.has(icon.name));
    expect(collisions).toEqual([]);
    expect(brands.every((icon) => icon.name.startsWith('brand:'))).toBe(true);
  });

  it('makes a brand mark take the colour it is given', () => {
    // simple-icons ships solid shapes that name no fill, so they render
    // black whatever `textColor` says. Without this the colour override
    // silently does nothing on exactly the blocks people style most.
    const facebook = resolveIconSvg('brand:facebook', 'classic');
    expect(facebook).toContain('fill="currentColor"');
  });

  it('resolves both sets when rendering, not just the one being browsed', () => {
    // The picker fetches them separately for size, but a page can hold an
    // interface icon and a brand mark side by side.
    expect(resolveIconSvg('star', 'classic')).toContain('<svg');
    expect(resolveIconSvg('brand:instagram', 'classic')).toContain('<svg');
  });
});
