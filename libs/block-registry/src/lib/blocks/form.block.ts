import { formBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

export const formBlock = coreBlock(formBlockContract, {
  label: 'blocks.form.label',
  category: 'conversion',
  icon: 'clipboard-list',
  defaultProps: {
    form: null,
  },
  fields: [
    FieldBuilder.custom('form', 'blocks.form.fields.form.fieldLabel', 'form'),
  ],
});
