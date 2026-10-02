import { describe, expect, it } from 'vitest';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { BLOCK_ICON_NAMES, blockIcon } from './block-icons';

/**
 * The registry names icons; this file holds the components. Nothing at
 * runtime complains when the two drift: a block naming an icon that is
 * not imported here quietly draws the neutral fallback, which looks like
 * a design decision rather than a mistake.
 */
describe('the editor can draw every icon the registry names', () => {
  const named = [
    ...new Set(
      [...pageBlocks, ...headerFooterBlocks]
        .map((block) => block.icon)
        .filter((icon): icon is string => Boolean(icon)),
    ),
  ];

  it('has a component for each one', () => {
    const missing = named.filter((icon) => !BLOCK_ICON_NAMES.includes(icon));
    expect(missing).toEqual([]);
  });

  it('carries nothing it no longer needs', () => {
    // Not correctness, weight: each entry is an icon bundled into the
    // editor, and lucide ships thousands.
    const unused = BLOCK_ICON_NAMES.filter((icon) => !named.includes(icon));
    expect(unused).toEqual([]);
  });

  it('falls back rather than rendering nothing', () => {
    expect(blockIcon(undefined)).toBeTruthy();
    expect(blockIcon('an-icon-that-does-not-exist')).toBeTruthy();
  });
});
