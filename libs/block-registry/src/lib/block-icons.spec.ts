import { describe, expect, it } from 'vitest';
import { pageBlocks } from './config';
import { headerFooterBlocks } from './layout-config';

/**
 * The inserter draws a tile per block type. A tile with no picture reads
 * as a broken block rather than an undecorated one, and one picture used
 * twice makes two different blocks look like the same thing — which is
 * the opposite of what an icon is for.
 */
describe('every registered block has a picture of its own', () => {
  const blocks = [...pageBlocks, ...headerFooterBlocks];

  it('names an icon', () => {
    const without = blocks.filter((block) => !block.icon).map((b) => b.type);
    expect(without).toEqual([]);
  });

  it('names it in the kebab-case lucide uses', () => {
    for (const block of blocks) {
      expect(block.icon, block.type).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('does not give two different types the same picture', () => {
    // Types registered in both the page and the header/footer sets are
    // the same block seen twice, not two blocks — compared by type.
    const byType = new Map(blocks.map((block) => [block.type, block.icon]));
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [type, icon] of byType) {
      const already = seen.get(icon as string);
      if (already) clashes.push(`${already} and ${type} both use ${icon}`);
      else seen.set(icon as string, type);
    }
    expect(clashes).toEqual([]);
  });
});
