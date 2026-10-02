import type { DiscountPriceProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { currencyField } from '../fields/currency-field';

/** A price, and the one it replaces struck through beside it. */
export const discountPriceBlock: BlockDescriptor<DiscountPriceProps> = {
  type: 'DiscountPrice',
  label: 'blocks.discountPrice.label',
  category: 'shop',
  icon: 'badge-percent',
  defaultProps: {
    price: null,
    compareAtPrice: null,
    currency: 'EUR',
    note: '',
  },
  fields: [
    {
      kind: 'number',
      key: 'price',
      min: 0,
      step: 0.01,
      optional: true,
      label: 'blocks.shared.price.priceFieldLabel',
    },
    {
      kind: 'number',
      key: 'compareAtPrice',
      min: 0,
      step: 0.01,
      optional: true,
      label: 'blocks.shared.price.compareAtPriceFieldLabel',
    },
    currencyField,
    {
      kind: 'text',
      key: 'note',
      translatable: true,
      label: 'blocks.discountPrice.fields.note.fieldLabel',
    },
  ],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.DiscountPrice,
};
