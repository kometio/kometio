import type { TeamMemberProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const teamMemberBlock: BlockDescriptor<TeamMemberProps> = {
  type: 'TeamMember',
  label: 'blocks.teamMember.label',
  category: 'socialProof',
  icon: 'user',
  defaultProps: {
    photo: null,
    name: 'Nome Cognome',
    role: 'Ruolo',
    bio: '',
  },
  fields: [
    FieldBuilder.custom(
      'photo',
      'blocks.teamMember.fields.photo.fieldLabel',
      'media',
    ),
    {
      kind: 'text',
      key: 'name',
      label: 'blocks.teamMember.fields.name.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'role',
      translatable: true,
      label: 'blocks.teamMember.fields.role.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'richtext',
      key: 'bio',
      translatable: true,
      label: 'blocks.teamMember.fields.bio.fieldLabel',
      inlineEditable: true,
    },
  ],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.TeamMember,
};
