import { discountPriceBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { currencyField } from '../fields/currency-field';

/** A price, and the one it replaces struck through beside it. */
export const discountPriceBlock = coreBlock(discountPriceBlockContract, {
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
});
