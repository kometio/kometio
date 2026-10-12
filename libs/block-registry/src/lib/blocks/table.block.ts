import { tableBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

export const tableBlock = coreBlock(tableBlockContract, {
  label: 'blocks.table.label',
  category: 'content',
  icon: 'table',
  defaultProps: {
    rows: [
      ['Column 1', 'Column 2'],
      ['', ''],
    ],
  },
  fields: [
    FieldBuilder.custom(
      'rows',
      'blocks.table.fields.rows.fieldLabel',
      'table-data',
    ),
  ],
});
