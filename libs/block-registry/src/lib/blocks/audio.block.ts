import { audioBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

export const audioBlock = coreBlock(audioBlockContract, {
  label: 'blocks.audio.label',
  category: 'media',
  icon: 'music',
  defaultProps: { media: null, title: '', loop: false },
  fields: [
    // `audio`, not `media` — see the same field on VideoFile.
    FieldBuilder.custom(
      'media',
      'blocks.audio.fields.media.fieldLabel',
      'audio',
    ),
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      label: 'blocks.audio.fields.title.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'boolean',
      key: 'loop',
      label: 'blocks.audio.fields.loop.fieldLabel',
    },
  ],
});
