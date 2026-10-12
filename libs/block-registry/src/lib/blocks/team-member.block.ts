import { teamMemberBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

export const teamMemberBlock = coreBlock(teamMemberBlockContract, {
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
});
