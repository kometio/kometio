import { breadcrumbBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { visibilityField } from '../fields/visibility-field';

export const breadcrumbBlock = coreBlock(breadcrumbBlockContract, {
  label: 'blocks.breadcrumb.label',
  category: 'content',
  icon: 'chevron-right',
  defaultProps: {
    homeLabel: 'Home',
    visibility: 'always',
  },
  fields: [
    {
      kind: 'text',
      key: 'homeLabel',
      translatable: true,
      label: 'blocks.breadcrumb.fields.homeLabel.fieldLabel',
      inlineEditable: true,
    },
    visibilityField,
  ],
});
