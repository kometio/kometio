import { comparisonTableBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * Plans or products side by side, a feature per row.
 *
 * Its rows are blocks rather than a spreadsheet field, so each one is
 * dragged, translated and styled like everything else on the page.
 */
export const comparisonTableBlock = coreBlock(comparisonTableBlockContract, {
  label: 'blocks.comparisonTable.label',
  category: 'content',
  icon: 'table-properties',
  defaultProps: { columns: '', highlightColumn: 0 },
  fields: [
    {
      kind: 'textarea',
      key: 'columns',
      translatable: true,
      label: 'blocks.comparisonTable.fields.columns.fieldLabel',
    },
    {
      kind: 'number',
      key: 'highlightColumn',
      min: 0,
      max: 6,
      step: 1,
      label: 'blocks.comparisonTable.fields.highlightColumn.fieldLabel',
      group: 'style',
    },
  ],
  isContainer: true,
  allowedChildTypes: ['ComparisonRow'],
});
