import { featureGridBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { displayField } from '../fields/display-field';

export const featureGridBlock = coreBlock(featureGridBlockContract, {
  label: 'blocks.featureGrid.label',
  category: 'interactive',
  icon: 'grid-3x3',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['Feature'],
});
