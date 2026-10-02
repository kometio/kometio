import type { VideoEmbedProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { aspectRatioField } from '../fields/aspect-ratio-field';

export const videoEmbedBlock: BlockDescriptor<VideoEmbedProps> = {
  type: 'VideoEmbed',
  label: 'blocks.videoEmbed.label',
  category: 'media',
  icon: 'monitor-play',
  defaultProps: {
    url: '',
    poster: null,
    aspectRatio: 'wide',
    caption: '',
  },
  fields: [
    {
      kind: 'text',
      key: 'url',
      label: 'blocks.videoEmbed.fields.url.fieldLabel',
      placeholder: 'https://www.youtube.com/watch?v=...',
    },
    FieldBuilder.custom(
      'poster',
      'blocks.videoEmbed.fields.poster.fieldLabel',
      'media',
    ),
    aspectRatioField,
    {
      kind: 'text',
      key: 'caption',
      translatable: true,
      label: 'blocks.shared.caption.fieldLabel',
    },
  ],
  stylableProperties: [
    'borderRadius',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'boxShadow',
    'maxWidth',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.VideoEmbed,
};
