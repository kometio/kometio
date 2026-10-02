import {
  BLOCK_STYLE_DEFAULTS,
  type VideoFileProps,
} from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';

// Distinct from VideoEmbed, and both are worth having (ADR-0054): an
// embed costs no bandwidth but brings a third party, its player and its
// cookies — which is why VideoEmbed sits behind a consent gate. This one
// has none of that, and is the right answer for a short clip.
export const videoFileBlock: BlockDescriptor<VideoFileProps> = {
  type: 'VideoFile',
  label: 'blocks.videoFile.label',
  category: 'media',
  icon: 'video',
  defaultProps: {
    media: null,
    poster: null,
    autoplay: false,
    loop: false,
    muted: false,
    controls: true,
  },
  fields: [
    // `video`, not `media`: with `media` the picker offered every file in
    // the library, and a photo chosen here drew an empty player.
    FieldBuilder.custom(
      'media',
      'blocks.videoFile.fields.media.fieldLabel',
      'video',
    ),
    FieldBuilder.custom(
      'poster',
      'blocks.videoFile.fields.poster.fieldLabel',
      'media',
    ),
    {
      kind: 'boolean',
      key: 'controls',
      label: 'blocks.videoFile.fields.controls.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'autoplay',
      label: 'blocks.videoFile.fields.autoplay.fieldLabel',
      group: 'advanced',
    },
    {
      kind: 'boolean',
      key: 'loop',
      label: 'blocks.videoFile.fields.loop.fieldLabel',
      group: 'advanced',
    },
    {
      kind: 'boolean',
      key: 'muted',
      label: 'blocks.videoFile.fields.muted.fieldLabel',
      group: 'advanced',
    },
  ],
  stylableProperties: [
    'borderRadius',
    'boxShadow',
    'maxWidth',
    'backgroundColor',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.VideoFile,
};
