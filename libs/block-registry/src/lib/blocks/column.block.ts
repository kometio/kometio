import type { ColumnProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

// No allowedChildTypes — a Column is meant to hold whatever the page
// needs side by side with its siblings, same reason as the Container.
// Only inside Columns, though: the grid that gives a column its width is
// Columns' (see Column.astro), and outside it a Column is a plain box.
export const columnBlock: BlockDescriptor<ColumnProps> = {
  type: 'Column',
  label: 'blocks.column.label',
  category: 'layout',
  icon: 'rectangle-vertical',
  defaultProps: {},
  fields: [
    {
      kind: 'number',
      key: 'span',
      label: 'blocks.column.fields.span.fieldLabel',
      min: 1,
      max: 12,
      step: 1,
      // Empty means "take an equal share of what the others left" — the
      // behaviour a column has until somebody gives it a width, and the
      // one it has to be able to go back to. See ADR-0050.
      optional: true,
    },
  ],
  isContainer: true,
  allowedParentTypes: ['Columns'],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Column,
};
