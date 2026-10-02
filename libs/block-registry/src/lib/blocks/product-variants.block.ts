import type { ProductVariantsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * The sizes or colours a product comes in, as information. Not a
 * selector: with no cart there is nothing a choice could change, and a
 * control that does nothing when pressed is worse than a list.
 */
export const productVariantsBlock: BlockDescriptor<ProductVariantsProps> = {
  type: 'ProductVariants',
  label: 'blocks.productVariants.label',
  category: 'shop',
  icon: 'swatch-book',
  defaultProps: { label: '', options: '' },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.productVariants.fields.label.fieldLabel',
    },
    {
      kind: 'textarea',
      key: 'options',
      translatable: true,
      label: 'blocks.productVariants.fields.options.fieldLabel',
    },
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ProductVariants,
};
