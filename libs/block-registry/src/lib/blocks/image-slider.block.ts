import { imageSliderBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

export const imageSliderBlock = coreBlock(imageSliderBlockContract, {
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
});
