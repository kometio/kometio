import type { FieldDescriptor } from '../field-types';

/**
 * The currency a price is in — shared by every block that shows one
 * (ProductCard, DiscountPrice, BuyButton), so a fourth currency is added
 * once and not three times.
 *
 * Not translatable: a product costs euros in every language it is
 * described in.
 */
export const currencyField: FieldDescriptor = {
  kind: 'select',
  key: 'currency',
  label: 'blocks.shared.price.currencyFieldLabel',
  options: [
    { label: 'blocks.shared.price.currencies.EUR', value: 'EUR' },
    { label: 'blocks.shared.price.currencies.USD', value: 'USD' },
    { label: 'blocks.shared.price.currencies.GBP', value: 'GBP' },
    { label: 'blocks.shared.price.currencies.CHF', value: 'CHF' },
  ],
};
