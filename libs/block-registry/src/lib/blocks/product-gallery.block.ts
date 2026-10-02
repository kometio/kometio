import type { ProductGalleryProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { aspectRatioField } from '../fields/aspect-ratio-field';

/**
 * One large picture of a product and the thumbnails that change it.
 *
 * The same picture list the Gallery block edits, so what somebody already
 * knows how to fill in works here unchanged.
 */
export const productGalleryBlock: BlockDescriptor<ProductGalleryProps> = {
  type: 'ProductGallery',
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
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap', 'maxWidth'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ProductGallery,
};
