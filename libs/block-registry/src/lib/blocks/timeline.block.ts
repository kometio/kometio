import { timelineBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const timelineBlock = coreBlock(timelineBlockContract, {
  label: 'blocks.timeline.label',
  category: 'socialProof',
  icon: 'milestone',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['TimelineStep'],
});
