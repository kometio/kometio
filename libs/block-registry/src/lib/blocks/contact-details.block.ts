import { contactDetailsBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * The site's address and phone number, from Business info.
 *
 * Read, never typed on the page: a phone number copied into six pages is
 * wrong on five of them the day it changes.
 */
export const contactDetailsBlock = coreBlock(contactDetailsBlockContract, {
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
});
