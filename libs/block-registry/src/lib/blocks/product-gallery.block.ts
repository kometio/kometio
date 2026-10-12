import { productGalleryBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';
import { aspectRatioField } from '../fields/aspect-ratio-field';

/**
 * One large picture of a product and the thumbnails that change it.
 *
 * The same picture list the Gallery block edits, so what somebody already
 * knows how to fill in works here unchanged.
 */
export const productGalleryBlock = coreBlock(productGalleryBlockContract, {
  label: 'blocks.productGallery.label',
  category: 'shop',
  icon: 'gallery-thumbnails',
  defaultProps: { images: [], aspectRatio: 'square' },
  fields: [
    FieldBuilder.custom(
      'images',
      'blocks.productGallery.fields.images.fieldLabel',
      'gallery',
    ),
    aspectRatioField,
  ],
});
