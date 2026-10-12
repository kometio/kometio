import { containerBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const containerBlock = coreBlock(containerBlockContract, {
  label: 'blocks.container.label',
  category: 'layout',
  icon: 'square',
  defaultProps: { background: 'none', padding: 'md' },
  fields: [
    {
      kind: 'radio',
      key: 'background',
      label: 'blocks.container.fields.background.fieldLabel',
      options: [
        {
          label: 'blocks.container.fields.background.options.none',
          value: 'none',
        },
        {
          label: 'blocks.container.fields.background.options.muted',
          value: 'muted',
        },
        {
          label: 'blocks.container.fields.background.options.primary',
          value: 'primary',
        },
        {
          label: 'blocks.container.fields.background.options.secondary',
          value: 'secondary',
        },
      ],
    },
    {
      kind: 'radio',
      key: 'padding',
      label: 'blocks.container.fields.padding.fieldLabel',
      options: [
        {
          label: 'blocks.container.fields.padding.options.none',
          value: 'none',
        },
        {
          label: 'blocks.container.fields.padding.options.sm',
          value: 'sm',
        },
        {
          label: 'blocks.container.fields.padding.options.md',
          value: 'md',
        },
        {
          label: 'blocks.container.fields.padding.options.lg',
          value: 'lg',
        },
      ],
    },
  ],
  // No allowedChildTypes — unlike Column (a fixed list for a grid
  // track), a Container is meant to hold anything, including another
  // Container or Columns.
  isContainer: true,
});
