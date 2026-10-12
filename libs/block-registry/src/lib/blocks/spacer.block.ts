import { spacerBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

// The height is `minHeight`, a style property, so it can differ per
// breakpoint — 4rem of air on a desktop and 1rem on a phone is the thing
// people actually want from a spacer, and a plain `height` prop could not
// say it (ADR-0053).
export const spacerBlock = coreBlock(spacerBlockContract, {
  label: 'blocks.spacer.label',
  category: 'layout',
  icon: 'move-vertical',
  defaultProps: {},
  fields: [],
});
