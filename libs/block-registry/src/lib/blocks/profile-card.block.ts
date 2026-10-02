import type { ProfileCardProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { teamMemberBlock } from './team-member.block';

/**
 * A person on their own, with a way to reach them: a Team member's card
 * — the same fields, drawn by the same component — plus an email and a
 * phone number.
 */
export const profileCardBlock: BlockDescriptor<ProfileCardProps> = {
  type: 'ProfileCard',
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
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.ProfileCard,
};
