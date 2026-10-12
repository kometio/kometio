import { statsCounterBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { displayField } from '../fields/display-field';

export const statsCounterBlock = coreBlock(statsCounterBlockContract, {
  label: 'blocks.statsCounter.label',
  category: 'socialProof',
  icon: 'chart-column',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['Stat'],
});
