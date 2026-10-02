import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { blockVariantNameSchema } from '@kometio/shared-types';

const BLOCKS_DIR = join(import.meta.dirname, '../components/blocks');

const withVariants = [...pageBlocks, ...headerFooterBlocks].filter(
  (descriptor) => (descriptor.variants?.length ?? 0) > 0,
);

describe('a block that declares variants can actually wear one', () => {
  it('finds the descriptors it is meant to be checking', () => {
    expect(withVariants.length).toBeGreaterThan(0);
  });

  /**
   * The class comes from BlockRenderer, and Astro passes an unknown prop
   * to a component without complaining — so a block type that declares
   * variants and forgets to render `variantClass` shows a picker in the
   * editor, saves the choice, and looks identical afterwards. Nothing
   * fails; the feature is simply absent for that block.
   */
  it.each(withVariants.map((d) => [d.type] as const))(
    '%s renders variantClass on its root element',
    (type) => {
      const path = join(BLOCKS_DIR, `${type}.astro`);
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('variantClass');
      expect(source).toMatch(/class:list=\{\[[\s\S]*?variantClass/);
    },
  );

  // The value becomes part of a selector, so a descriptor cannot smuggle
  // one past the rule by declaring it in code rather than typing it in.
  it.each(
    withVariants.flatMap((d) =>
      (d.variants ?? []).map((v) => [`${d.type}.${v.value}`, v.value] as const),
    ),
  )('%s is a usable variant name', (_name, value) => {
    expect(blockVariantNameSchema.safeParse(value).success).toBe(true);
  });

  it.each(
    withVariants.flatMap((d) =>
      (d.variants ?? []).map((v) => [`${d.type}.${v.value}`, v.label] as const),
    ),
  )('%s has a translated label, not a bare string', (_name, label) => {
    expect(label).toMatch(/^blocks\.[a-zA-Z.]+$/);
  });
});
