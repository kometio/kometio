import type { WhatsAppButtonProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { visibilityField } from '../fields/visibility-field';

export const whatsAppButtonBlock: BlockDescriptor<WhatsAppButtonProps> = {
  type: 'WhatsAppButton',
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
  stylableProperties: ['backgroundColor', 'borderRadius', 'boxShadow'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.WhatsAppButton,
};
