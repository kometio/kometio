import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CASCADE_LAYER_ORDER, CASCADE_LAYER_ORDER_CSS } from './cascade-layers';

const rank = (layer: string) =>
  CASCADE_LAYER_ORDER.indexOf(layer as (typeof CASCADE_LAYER_ORDER)[number]);

describe('CASCADE_LAYER_ORDER', () => {
  it("ranks every kometio layer above Tailwind's, so its reset cannot beat a block rule", () => {
    for (const tailwind of [
      'properties',
      'theme',
      'base',
      'components',
      'utilities',
    ]) {
      expect(rank(tailwind)).toBeGreaterThanOrEqual(0);
      expect(rank(tailwind)).toBeLessThan(rank('kometio.base'));
    }
  });

  it('lets a type override beat the default, and an instance beat both', () => {
    expect(rank('kometio.base')).toBeLessThan(rank('kometio.class'));
    expect(rank('kometio.class')).toBeLessThan(rank('kometio.instance'));
  });

  it('names Tailwind layers in the order Tailwind itself declares them', () => {
    const tailwindCss = readFileSync(
      fileURLToPath(import.meta.resolve('tailwindcss/index.css')),
      'utf8',
    );
    const declared =
      /@layer ([a-z, ]+);/.exec(tailwindCss)?.[1]?.split(', ') ?? [];
    expect(declared.length).toBeGreaterThan(0);
    expect(
      CASCADE_LAYER_ORDER.filter((layer) => declared.includes(layer)),
    ).toEqual(declared);
  });

  it('is one statement a <style> can carry as it is', () => {
    expect(CASCADE_LAYER_ORDER_CSS).toBe(
      '@layer properties, theme, base, components, utilities, kometio.base, kometio.class, kometio.instance;',
    );
  });
});
