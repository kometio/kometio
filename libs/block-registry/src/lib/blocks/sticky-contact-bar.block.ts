import { stickyContactBarBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * Call, WhatsApp, map and email, fixed to the bottom of a phone's screen.
 *
 * The phone, the address and the email come from Business info, like the
 * Contacts block's: typed once for the site. Only the WhatsApp number is
 * the block's own, because Business info has no such field and a shop's
 * WhatsApp is often not its landline.
 */
export const stickyContactBarBlock = coreBlock(stickyContactBarBlockContract, {
  label: 'blocks.stickyContactBar.label',
  category: 'localBusiness',
  icon: 'phone',
  defaultProps: {
    showCall: true,
    whatsappNumber: '',
    showDirections: true,
    showEmail: false,
  },
  fields: [
    {
      kind: 'boolean',
      key: 'showCall',
      label: 'blocks.stickyContactBar.fields.showCall.fieldLabel',
    },
    {
      kind: 'text',
      key: 'whatsappNumber',
      label: 'blocks.stickyContactBar.fields.whatsappNumber.fieldLabel',
      placeholder: '393331234567',
    },
    {
      kind: 'boolean',
      key: 'showDirections',
      label: 'blocks.stickyContactBar.fields.showDirections.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'showEmail',
      label: 'blocks.stickyContactBar.fields.showEmail.fieldLabel',
    },
  ],
});
