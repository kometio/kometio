import { profileCardBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { teamMemberBlock } from './team-member.block';

/**
 * A person on their own, with a way to reach them: a Team member's card
 * — the same fields, drawn by the same component — plus an email and a
 * phone number.
 */
export const profileCardBlock = coreBlock(profileCardBlockContract, {
  label: 'blocks.profileCard.label',
  category: 'content',
  icon: 'id-card',
  defaultProps: {
    photo: null,
    name: '',
    role: '',
    bio: '',
    email: '',
    phone: '',
  },
  fields: [
    ...teamMemberBlock.fields,
    {
      kind: 'text',
      key: 'email',
      label: 'blocks.profileCard.fields.email.fieldLabel',
    },
    {
      kind: 'text',
      key: 'phone',
      label: 'blocks.profileCard.fields.phone.fieldLabel',
    },
  ],
});
