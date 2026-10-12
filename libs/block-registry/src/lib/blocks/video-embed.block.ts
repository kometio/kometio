import { videoEmbedBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';
import { aspectRatioField } from '../fields/aspect-ratio-field';

export const videoEmbedBlock = coreBlock(videoEmbedBlockContract, {
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
});
