import type { MediaTextProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * A picture beside words.
 *
 * The one layout every WordPress site is half made of. Stacks when the
 * space it has — not the screen — gets too narrow for two columns, and
 * `start`/`end` follow the page's direction, so the picture on the left
 * in Italian is on the right in Arabic.
 */
export const mediaTextBlock: BlockDescriptor<MediaTextProps> = {
  type: 'MediaText',
  label: 'blocks.mediaText.label',
  category: 'media',
  icon: 'layout-panel-left',
  defaultProps: {
    media: null,
    alt: '',
    heading: '',
    body: '',
    mediaSide: 'start',
    mediaWidth: 'half',
    verticalAlign: 'center',
  },
  fields: [
    FieldBuilder.custom(
      'media',
      'blocks.mediaText.fields.media.fieldLabel',
      'media',
    ),
    {
      kind: 'text',
      key: 'alt',
      translatable: true,
      label: 'blocks.mediaText.fields.alt.fieldLabel',
    },
    {
      kind: 'text',
      key: 'heading',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.mediaText.fields.heading.fieldLabel',
    },
    {
      kind: 'richtext',
      key: 'body',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.mediaText.fields.body.fieldLabel',
    },
    {
      kind: 'radio',
      key: 'mediaSide',
      label: 'blocks.mediaText.fields.mediaSide.fieldLabel',
      group: 'style',
      options: [
        {
          label: 'blocks.mediaText.fields.mediaSide.options.start',
          value: 'start',
        },
        {
          label: 'blocks.mediaText.fields.mediaSide.options.end',
          value: 'end',
        },
      ],
    },
    {
      kind: 'radio',
      key: 'mediaWidth',
      label: 'blocks.mediaText.fields.mediaWidth.fieldLabel',
      group: 'style',
      options: [
        {
          label: 'blocks.mediaText.fields.mediaWidth.options.third',
          value: 'third',
        },
        {
          label: 'blocks.mediaText.fields.mediaWidth.options.half',
          value: 'half',
        },
        {
          label: 'blocks.mediaText.fields.mediaWidth.options.twoThirds',
          value: 'two-thirds',
        },
      ],
    },
    {
      kind: 'radio',
      key: 'verticalAlign',
      label: 'blocks.mediaText.fields.verticalAlign.fieldLabel',
      group: 'style',
      options: [
        {
          label: 'blocks.mediaText.fields.verticalAlign.options.start',
          value: 'start',
        },
        {
          label: 'blocks.mediaText.fields.verticalAlign.options.center',
          value: 'center',
        },
        {
          label: 'blocks.mediaText.fields.verticalAlign.options.end',
          value: 'end',
        },
      ],
    },
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.MediaText,
};
