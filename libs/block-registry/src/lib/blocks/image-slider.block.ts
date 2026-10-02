import type { ImageSliderProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';

export const imageSliderBlock: BlockDescriptor<ImageSliderProps> = {
  type: 'ImageSlider',
  label: 'blocks.imageSlider.label',
  category: 'media',
  icon: 'gallery-horizontal-end',
  defaultProps: {
    images: [],
  },
  fields: [
    FieldBuilder.custom(
      'images',
      'blocks.imageSlider.fields.images.fieldLabel',
      'gallery',
    ),
  ],
  stylableProperties: ['borderRadius', 'boxShadow', 'maxWidth'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ImageSlider,
};
