import {
  PAYMENT_METHODS,
  trustBadgesBlockContract,
} from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/** The payment methods a shop accepts, as their logos, and a line of reassurance. */
export const trustBadgesBlock = coreBlock(trustBadgesBlockContract, {
  label: 'blocks.trustBadges.label',
  category: 'conversion',
  icon: 'shield-check',
  defaultProps: {
    visa: true,
    mastercard: true,
    americanexpress: false,
    paypal: true,
    applepay: false,
    googlepay: false,
    klarna: false,
    stripe: false,
    text: '',
  },
  fields: [
    ...PAYMENT_METHODS.map((method) => ({
      kind: 'boolean' as const,
      key: method,
      label: `blocks.trustBadges.fields.${method}.fieldLabel`,
    })),
    {
      kind: 'text',
      key: 'text',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.trustBadges.fields.text.fieldLabel',
    },
  ],
});
