import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { blockTypeToClassName } from '@kometio/shared-types';

const BLOCKS_DIR = join(import.meta.dirname, '../components/blocks');

/**
 * The site-wide style of a type (Style → a block type) is a rule on the
 * type's class, `.kometio-buy-button` for BuyButton (block-style-overrides.ts).
 * A block whose markup never carries that class ignores every site-wide
 * style set for it, and nothing says so: the Style screen offers the
 * controls, saves them, and the page does not change.
 *
 * It is easy to fall into for a block drawn by another block's component
 * — a buy button is a Button, a masonry gallery is a Gallery — which is
 * why the class is passed down to the component that renders the root.
 */
describe('every stylable block carries its type class', () => {
  const types = [
    ...new Set(
      [...pageBlocks, ...headerFooterBlocks]
        .filter((descriptor) => descriptor.stylableProperties?.length)
        .map((descriptor) => descriptor.type),
    ),
  ];

  it.each(types.map((type) => [type] as const))(
    '%s names its class in its component',
    (type) => {
      const source = readFileSync(join(BLOCKS_DIR, `${type}.astro`), 'utf8');
      const className = blockTypeToClassName(type);
      // A quote, a backtick or a space before it: `kometio-icon kometio-icon--${size}`
      // names the class inside a template string.
      expect(source).toMatch(
        new RegExp('[\'"`\\s]' + className + '(?![\\w-])'),
      );
    },
  );
});
