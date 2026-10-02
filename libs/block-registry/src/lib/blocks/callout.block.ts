import { defineBlock } from '@kometio/block-sdk';
import {
  BLOCK_STYLE_DEFAULTS,
  calloutPropsSchema,
} from '@kometio/shared-types';

/**
 * The worked example for `@kometio/block-sdk` — see libs/block-sdk/README.md.
 * A real, first-party block like any other in this folder, just defined
 * with `defineBlock()` instead of a raw object literal: `defaultProps`
 * below is checked against `calloutPropsSchema` the moment this module
 * loads, so a typo here fails immediately instead of silently at first
 * render.
 */
export const calloutBlock = defineBlock({
  type: 'Callout',
  label: 'blocks.callout.label',
  category: 'content',
  icon: 'message-square-warning',
  schema: calloutPropsSchema,
  defaultProps: {
    message: 'Your message here',
    tone: 'info',
  },
  fields: [
    {
      kind: 'richtext',
      key: 'message',
      translatable: true,
      label: 'blocks.callout.fields.message.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'select',
      key: 'tone',
      label: 'blocks.callout.fields.tone.fieldLabel',
      options: [
        { label: 'blocks.callout.fields.tone.options.info', value: 'info' },
        {
          label: 'blocks.callout.fields.tone.options.warning',
          value: 'warning',
        },
        {
          label: 'blocks.callout.fields.tone.options.success',
          value: 'success',
        },
      ],
    },
  ],
  stylableProperties: ['borderRadius', 'paddingX', 'paddingY'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Callout,
});
