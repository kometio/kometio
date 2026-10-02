import { BLOCK_STYLE_DEFAULTS, type TableProps } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const tableBlock: BlockDescriptor<TableProps> = {
  type: 'Table',
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
  stylableProperties: [
    ...BlockStyleRegistry.STANDARD,
    'borderWidth',
    'borderStyle',
    'borderColor',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Table,
};
