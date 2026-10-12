import { buyButtonBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { currencyField } from '../fields/currency-field';

/**
 * A button to the page where the product is paid for — a Stripe or PayPal
 * payment link. Drawn by the Button block, so it looks like every other
 * button on the site; what it adds is the price on the label.
 */
export const buyButtonBlock = coreBlock(buyButtonBlockContract, {
  label: 'blocks.buyButton.label',
  category: 'shop',
  icon: 'shopping-cart',
  defaultProps: { label: '', url: '', price: null, currency: 'EUR' },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      // Not edited in place: the button shows the label with the price
      // joined to it, and typing into that would save the price as words.
      label: 'blocks.buyButton.fields.label.fieldLabel',
    },
    {
      kind: 'text',
      key: 'url',
      required: true,
      translatable: true,
      label: 'blocks.buyButton.fields.url.fieldLabel',
      placeholder: 'https://buy.stripe.com/…',
    },
    {
      kind: 'number',
      key: 'price',
      min: 0,
      step: 0.01,
      optional: true,
      label: 'blocks.shared.price.priceFieldLabel',
    },
    currencyField,
  ],
});
