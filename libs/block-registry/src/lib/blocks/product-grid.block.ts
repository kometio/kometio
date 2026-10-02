import type { ProductGridProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { displayField } from '../fields/display-field';

/** A shop window: product cards in a grid, a slider or a carousel. */
export const productGridBlock: BlockDescriptor<ProductGridProps> = {
  type: 'ProductGrid',
  label: 'blocks.productGrid.label',
  category: 'shop',
  icon: 'store',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['ProductCard'],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ProductGrid,
};
