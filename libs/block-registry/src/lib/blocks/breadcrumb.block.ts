import {
  BLOCK_STYLE_DEFAULTS,
  type BreadcrumbProps,
} from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { visibilityField } from '../fields/visibility-field';

export const breadcrumbBlock: BlockDescriptor<BreadcrumbProps> = {
  type: 'Breadcrumb',
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
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Breadcrumb,
};
