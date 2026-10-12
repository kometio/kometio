import { pricingTableBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { displayField } from '../fields/display-field';

export const pricingTableBlock = coreBlock(pricingTableBlockContract, {
  label: 'blocks.pricingTable.label',
  category: 'socialProof',
  icon: 'receipt',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['PricingPlan'],
});
