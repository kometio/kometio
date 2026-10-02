import type { SiblingPagesProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * The page before and after this one in the page tree — how a manual or a
 * course is read. No fields: both ends are the tree's answer.
 */
export const siblingPagesBlock: BlockDescriptor<SiblingPagesProps> = {
  type: 'SiblingPages',
  label: 'blocks.siblingPages.label',
  category: 'content',
  icon: 'move-horizontal',
  defaultProps: { previous: null, next: null },
  fields: [],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.SiblingPages,
};
