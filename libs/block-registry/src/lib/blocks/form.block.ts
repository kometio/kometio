import type { FormBlockProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const formBlock: BlockDescriptor<FormBlockProps> = {
  type: 'Form',
  label: 'blocks.form.label',
  category: 'conversion',
  icon: 'clipboard-list',
  defaultProps: {
    form: null,
  },
  fields: [
    FieldBuilder.custom('form', 'blocks.form.fields.form.fieldLabel', 'form'),
  ],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Form,
};
