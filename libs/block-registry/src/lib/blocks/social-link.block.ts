import {
  BLOCK_STYLE_DEFAULTS,
  type SocialLinkProps,
} from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const socialLinkBlock: BlockDescriptor<SocialLinkProps> = {
  type: 'SocialLink',
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
  stylableProperties: [
    ...BlockStyleRegistry.STANDARD,
    'borderWidth',
    'borderStyle',
    'borderColor',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.SocialLink,
};
