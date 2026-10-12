import { specListBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/** Specifications: weight, size, material — a label and a value per line. */
export const specListBlock = coreBlock(specListBlockContract, {
  label: 'blocks.specList.label',
  category: 'content',
  icon: 'scroll-text',
  defaultProps: { columns: 'one' },
  fields: [
    {
      kind: 'radio',
      key: 'columns',
      label: 'blocks.specList.fields.columns.fieldLabel',
      group: 'style',
      options: [
        { label: 'blocks.specList.fields.columns.options.one', value: 'one' },
        { label: 'blocks.specList.fields.columns.options.two', value: 'two' },
      ],
    },
  ],
  isContainer: true,
  allowedChildTypes: ['SpecItem'],
});
