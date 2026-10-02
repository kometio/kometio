import type { BlockStylePropertyName } from '@kometio/block-sdk';

/**
 * Single source for `stylableProperties` presets (docs/adr/0022) shared
 * by multiple blocks — previously each block repeated the array literal,
 * with the risk that a block would silently fall behind when the set
 * changed (see the "Replaces the old backgroundColor" comment left in
 * banner.block.ts, already happened once). A block with a different set
 * (e.g. Container: only `textColor`+`borderRadius`) still declares its
 * own array literal — this class only covers the common case, reused by
 * the majority of blocks, not every possible combination.
 */
export class BlockStyleRegistry {
  /** Background, text color, borders, horizontal/vertical padding. */
  static readonly STANDARD: readonly BlockStylePropertyName[] = [
    'backgroundColor',
    'textColor',
    'borderRadius',
    'paddingX',
    'paddingY',
  ];
}
