import type { FieldDescriptor } from '../field-types';

/**
 * The shape a picture, a gallery tile or an embedded player is cropped
 * to — the same five options with the same labels, written out
 * identically in Image, Gallery and VideoEmbed before it was named here
 * (the same treatment `ctaLinkFields` already gives the link fields).
 *
 * `group: 'style'` because it is what the block LOOKS like, not what it
 * says: it belongs beside the border radius, not beside the caption
 * (ADR-0062).
 */
export const aspectRatioField: FieldDescriptor = {
  kind: 'select',
  key: 'aspectRatio',
  label: 'blocks.shared.aspectRatio.fieldLabel',
  group: 'style',
  options: [
    { label: 'blocks.shared.aspectRatio.options.original', value: 'original' },
    { label: 'blocks.shared.aspectRatio.options.square', value: 'square' },
    {
      label: 'blocks.shared.aspectRatio.options.landscape',
      value: 'landscape',
    },
    { label: 'blocks.shared.aspectRatio.options.portrait', value: 'portrait' },
    { label: 'blocks.shared.aspectRatio.options.wide', value: 'wide' },
  ],
};
