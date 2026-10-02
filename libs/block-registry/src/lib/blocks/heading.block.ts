import { defineBlock } from '@kometio/block-sdk';
import {
  BLOCK_STYLE_DEFAULTS,
  headingPropsSchema,
} from '@kometio/shared-types';

export const headingBlock = defineBlock({
  type: 'Heading',
  label: 'blocks.heading.label',
  category: 'content',
  icon: 'heading',
  schema: headingPropsSchema,
  defaultProps: {
    text: 'Section heading',
    level: 'h2',
  },
  fields: [
    {
      kind: 'text',
      key: 'text',
      translatable: true,
      label: 'blocks.heading.fields.text.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'select',
      key: 'level',
      label: 'blocks.heading.fields.level.fieldLabel',
      options: [
        { label: 'blocks.heading.fields.level.options.h1', value: 'h1' },
        { label: 'blocks.heading.fields.level.options.h2', value: 'h2' },
        { label: 'blocks.heading.fields.level.options.h3', value: 'h3' },
      ],
    },
  ],
  stylableProperties: ['textColor'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Heading,
});
