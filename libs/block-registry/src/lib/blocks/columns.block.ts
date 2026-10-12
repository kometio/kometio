import { columnsBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const columnsBlock = coreBlock(columnsBlockContract, {
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
});
