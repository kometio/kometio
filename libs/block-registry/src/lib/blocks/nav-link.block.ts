import type { NavLinkProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { ctaLinkFields } from '../fields/link-type-field';
import { positionField } from '../fields/position-field';
import { visibilityField } from '../fields/visibility-field';

export const navLinkBlock: BlockDescriptor<NavLinkProps> = {
  type: 'NavLink',
  label: 'blocks.navLink.label',
  category: 'navigation',
  icon: 'link-2',
  defaultProps: {
    label: 'Link',
    linkType: 'page',
    page: null,
    url: '',
    icon: null,
    position: 'left',
    visibility: 'always',
  },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.navLink.fields.label.fieldLabel',
      inlineEditable: true,
    },
    ...ctaLinkFields(),
    FieldBuilder.custom(
      'icon',
      'blocks.navLink.fields.icon.fieldLabel',
      'icon',
    ),
    positionField,
    visibilityField,
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.NavLink,
};
