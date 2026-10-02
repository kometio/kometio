import { BLOCK_STYLE_DEFAULTS, type SpacerProps } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

// The height is `minHeight`, a style property, so it can differ per
// breakpoint — 4rem of air on a desktop and 1rem on a phone is the thing
// people actually want from a spacer, and a plain `height` prop could not
// say it (ADR-0053).
export const spacerBlock: BlockDescriptor<SpacerProps> = {
  type: 'Spacer',
  label: 'blocks.spacer.label',
  category: 'layout',
  icon: 'move-vertical',
  defaultProps: {},
  fields: [],
  stylableProperties: ['minHeight', 'backgroundColor'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Spacer,
};
