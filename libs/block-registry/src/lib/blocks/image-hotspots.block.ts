import type { ImageHotspotsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/** A picture with points on it that open a short explanation. */
export const imageHotspotsBlock: BlockDescriptor<ImageHotspotsProps> = {
  type: 'ImageHotspots',
  label: 'blocks.imageHotspots.label',
  category: 'media',
  icon: 'locate-fixed',
  defaultProps: { image: null, alt: '' },
  fields: [
    FieldBuilder.custom(
      'image',
      'blocks.imageHotspots.fields.image.fieldLabel',
      'media',
    ),
    {
      kind: 'text',
      key: 'alt',
      translatable: true,
      label: 'blocks.imageHotspots.fields.alt.fieldLabel',
    },
  ],
  isContainer: true,
  allowedChildTypes: ['Hotspot'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.ImageHotspots,
};
