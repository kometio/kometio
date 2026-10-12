import { socialLinkBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

export const socialLinkBlock = coreBlock(socialLinkBlockContract, {
  label: 'blocks.socialLink.label',
  category: 'conversion',
  icon: 'at-sign',
  defaultProps: { icon: null, label: '', url: '' },
  fields: [
    FieldBuilder.custom(
      'icon',
      'blocks.socialLink.fields.icon.fieldLabel',
      'icon',
    ),
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.socialLink.fields.label.fieldLabel',
      // Required, and not merely encouraged: an icon-only link with no
      // accessible name is announced as "link" and nothing else.
      required: true,
    },
    {
      kind: 'text',
      key: 'url',
      label: 'blocks.socialLink.fields.url.fieldLabel',
      placeholder: 'https://',
      required: true,
    },
  ],
});
