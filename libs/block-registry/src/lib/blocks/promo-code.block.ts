import type { PromoCodeProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/** A discount code with a button that copies it. */
export const promoCodeBlock: BlockDescriptor<PromoCodeProps> = {
  type: 'PromoCode',
  label: 'blocks.promoCode.label',
  category: 'shop',
  icon: 'ticket-percent',
  defaultProps: { code: '', description: '', expiresOn: '' },
  fields: [
    {
      kind: 'text',
      key: 'code',
      required: true,
      label: 'blocks.promoCode.fields.code.fieldLabel',
    },
    {
      kind: 'text',
      key: 'description',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.promoCode.fields.description.fieldLabel',
    },
    FieldBuilder.custom(
      'expiresOn',
      'blocks.promoCode.fields.expiresOn.fieldLabel',
      'date',
    ),
  ],
  stylableProperties: [
    ...BlockStyleRegistry.STANDARD,
    'borderWidth',
    'borderStyle',
    'borderColor',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.PromoCode,
};
