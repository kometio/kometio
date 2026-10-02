import type { ColumnsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const columnsBlock: BlockDescriptor<ColumnsProps> = {
  type: 'Columns',
  label: 'blocks.columns.label',
  category: 'layout',
  icon: 'columns-3',
  defaultProps: { stackBelow: 'mobile', verticalAlign: 'stretch' },
  fields: [
    {
      kind: 'radio',
      key: 'stackBelow',
      label: 'blocks.columns.fields.stackBelow.fieldLabel',
      options: [
        {
          label: 'blocks.columns.fields.stackBelow.options.mobile',
          value: 'mobile',
        },
        {
          label: 'blocks.columns.fields.stackBelow.options.tablet',
          value: 'tablet',
        },
        {
          label: 'blocks.columns.fields.stackBelow.options.never',
          value: 'never',
        },
      ],
    },
    {
      kind: 'select',
      key: 'verticalAlign',
      label: 'blocks.columns.fields.verticalAlign.fieldLabel',
      options: [
        {
          label: 'blocks.columns.fields.verticalAlign.options.stretch',
          value: 'stretch',
        },
        {
          label: 'blocks.columns.fields.verticalAlign.options.start',
          value: 'start',
        },
        {
          label: 'blocks.columns.fields.verticalAlign.options.center',
          value: 'center',
        },
        {
          label: 'blocks.columns.fields.verticalAlign.options.end',
          value: 'end',
        },
      ],
    },
  ],
  isContainer: true,
  rendersFromChildren: true,
  allowedChildTypes: ['Column'],
  // `gap` on top of the standard set (ADR-0050): the space between columns
  // was a hardcoded 1.5rem, which made a row of tight cards and a row of
  // full sections the same distance apart.
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Columns,
};
