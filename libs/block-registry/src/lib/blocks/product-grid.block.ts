import { productGridBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { displayField } from '../fields/display-field';

/** A shop window: product cards in a grid, a slider or a carousel. */
export const productGridBlock = coreBlock(productGridBlockContract, {
  label: 'blocks.productGrid.label',
  category: 'shop',
  icon: 'store',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['ProductCard'],
});
