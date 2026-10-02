import type { TimelineProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

export const timelineBlock: BlockDescriptor<TimelineProps> = {
  type: 'Timeline',
  label: 'blocks.timeline.label',
  category: 'socialProof',
  icon: 'milestone',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['TimelineStep'],
  // No paddingX/paddingY: padding-left is structural in Timeline.astro.
  stylableProperties: ['backgroundColor', 'textColor', 'borderRadius'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Timeline,
};
