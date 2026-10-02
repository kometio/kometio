import type { MasonryGalleryProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * Pictures in columns, each at its own height — the Gallery block's
 * pictures and component, laid out the way a portfolio of mixed
 * portraits and landscapes wants to be.
 */
export const masonryGalleryBlock: BlockDescriptor<MasonryGalleryProps> = {
  type: 'MasonryGallery',
  label: 'blocks.masonryGallery.label',
  category: 'media',
  icon: 'layout-dashboard',
  defaultProps: { images: [], columns: '3', lightbox: true },
  fields: [
    FieldBuilder.custom(
      'images',
      'blocks.gallery.fields.images.fieldLabel',
      'gallery',
    ),
    {
      kind: 'radio',
      key: 'columns',
      label: 'blocks.gallery.fields.columns.fieldLabel',
      group: 'style',
      options: [
        { label: 'blocks.gallery.fields.columns.options.2', value: '2' },
        { label: 'blocks.gallery.fields.columns.options.3', value: '3' },
        { label: 'blocks.gallery.fields.columns.options.4', value: '4' },
      ],
    },
    {
      kind: 'boolean',
      key: 'lightbox',
      label: 'blocks.image.fields.lightbox.fieldLabel',
    },
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.MasonryGallery,
};
