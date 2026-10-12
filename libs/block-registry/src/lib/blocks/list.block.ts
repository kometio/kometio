import { listBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

/**
 * A list whose items are blocks.
 *
 * Not a text field with line breaks: each item is edited in place, moved
 * by dragging, styled and translated on its own — the same shape every
 * other repeatable thing here has (Accordion, Timeline, Team).
 */
export const listBlock = coreBlock(listBlockContract, {
  label: 'blocks.list.label',
  category: 'content',
  icon: 'list',
  defaultProps: { marker: 'bullet', icon: 'star' },
  fields: [
    {
      kind: 'radio',
      key: 'marker',
      label: 'blocks.list.fields.marker.fieldLabel',
      options: [
        { label: 'blocks.list.fields.marker.options.bullet', value: 'bullet' },
        { label: 'blocks.list.fields.marker.options.number', value: 'number' },
        { label: 'blocks.list.fields.marker.options.check', value: 'check' },
        { label: 'blocks.list.fields.marker.options.icon', value: 'icon' },
      ],
    },
    FieldBuilder.custom('icon', 'blocks.list.fields.icon.fieldLabel', 'icon', {
      showWhen: { field: 'marker', equals: 'icon' },
    }),
  ],
  isContainer: true,
  allowedChildTypes: ['ListItem'],
});
