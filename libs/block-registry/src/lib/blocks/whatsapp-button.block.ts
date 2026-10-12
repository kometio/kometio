import { whatsAppButtonBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { visibilityField } from '../fields/visibility-field';

export const whatsAppButtonBlock = coreBlock(whatsAppButtonBlockContract, {
  label: 'blocks.whatsAppButton.label',
  category: 'chrome',
  icon: 'message-circle',
  defaultProps: {
    phoneNumber: '',
    message: '',
    visibility: 'always',
  },
  fields: [
    {
      kind: 'text',
      key: 'phoneNumber',
      label: 'blocks.whatsAppButton.fields.phoneNumber.fieldLabel',
    },
    {
      kind: 'text',
      key: 'message',
      translatable: true,
      label: 'blocks.whatsAppButton.fields.message.fieldLabel',
    },
    visibilityField,
  ],
});
