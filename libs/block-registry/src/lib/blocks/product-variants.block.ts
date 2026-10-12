import { productVariantsBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * The sizes or colours a product comes in, as information. Not a
 * selector: with no cart there is nothing a choice could change, and a
 * control that does nothing when pressed is worse than a list.
 */
export const productVariantsBlock = coreBlock(productVariantsBlockContract, {
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
});
