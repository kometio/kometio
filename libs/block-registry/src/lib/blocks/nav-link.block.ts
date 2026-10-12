import { navLinkBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';
import { ctaLinkFields } from '../fields/link-type-field';
import { positionField } from '../fields/position-field';
import { visibilityField } from '../fields/visibility-field';

export const navLinkBlock = coreBlock(navLinkBlockContract, {
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
});
