import { promoCodeBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

/** A discount code with a button that copies it. */
export const promoCodeBlock = coreBlock(promoCodeBlockContract, {
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
});
