import type { ContactDetailsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * The site's address and phone number, from Business info.
 *
 * Read, never typed on the page: a phone number copied into six pages is
 * wrong on five of them the day it changes.
 */
export const contactDetailsBlock: BlockDescriptor<ContactDetailsProps> = {
  type: 'ContactDetails',
  label: 'blocks.contactDetails.label',
  category: 'localBusiness',
  icon: 'contact',
  defaultProps: {
    showAddress: true,
    showPhone: true,
    showEmail: true,
    showMapLink: true,
  },
  fields: [
    {
      kind: 'boolean',
      key: 'showAddress',
      label: 'blocks.contactDetails.fields.showAddress.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'showPhone',
      label: 'blocks.contactDetails.fields.showPhone.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'showEmail',
      label: 'blocks.contactDetails.fields.showEmail.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'showMapLink',
      label: 'blocks.contactDetails.fields.showMapLink.fieldLabel',
      showWhen: { field: 'showAddress', equals: true },
    },
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ContactDetails,
};
