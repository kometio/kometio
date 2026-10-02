import type { TrustBadgesProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS, PAYMENT_METHODS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/** The payment methods a shop accepts, as their logos, and a line of reassurance. */
export const trustBadgesBlock: BlockDescriptor<TrustBadgesProps> = {
  type: 'TrustBadges',
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
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.TrustBadges,
};
