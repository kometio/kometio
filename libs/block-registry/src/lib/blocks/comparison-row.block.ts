import { comparisonRowBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const comparisonRowBlock = coreBlock(comparisonRowBlockContract, {
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
});
