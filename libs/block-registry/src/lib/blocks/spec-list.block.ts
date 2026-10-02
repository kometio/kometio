import type { SpecListProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/** Specifications: weight, size, material — a label and a value per line. */
export const specListBlock: BlockDescriptor<SpecListProps> = {
  type: 'SpecList',
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
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.SpecList,
};
