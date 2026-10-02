import type { ComparisonRowProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

export const comparisonRowBlock: BlockDescriptor<ComparisonRowProps> = {
  type: 'ComparisonRow',
  label: 'blocks.comparisonRow.label',
  category: 'content',
  icon: 'rows-2',
  defaultProps: { feature: '', values: '' },
  fields: [
    {
      kind: 'text',
      key: 'feature',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.comparisonRow.fields.feature.fieldLabel',
    },
    {
      kind: 'textarea',
      key: 'values',
      translatable: true,
      label: 'blocks.comparisonRow.fields.values.fieldLabel',
    },
  ],
  // A row of cells outside its table has no columns to line up with.
  allowedParentTypes: ['ComparisonTable'],
  stylableProperties: ['backgroundColor', 'textColor', 'paddingX', 'paddingY'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ComparisonRow,
};
