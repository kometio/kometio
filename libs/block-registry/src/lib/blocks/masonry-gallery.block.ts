import { masonryGalleryBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

/**
 * Pictures in columns, each at its own height — the Gallery block's
 * pictures and component, laid out the way a portfolio of mixed
 * portraits and landscapes wants to be.
 */
export const masonryGalleryBlock = coreBlock(masonryGalleryBlockContract, {
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
});
