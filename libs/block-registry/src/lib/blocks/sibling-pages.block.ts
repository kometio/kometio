import { siblingPagesBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * The page before and after this one in the page tree — how a manual or a
 * course is read. No fields: both ends are the tree's answer.
 */
export const siblingPagesBlock = coreBlock(siblingPagesBlockContract, {
  label: 'blocks.siblingPages.label',
  category: 'content',
  icon: 'move-horizontal',
  defaultProps: { previous: null, next: null },
  fields: [],
});
