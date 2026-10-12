import { galleryBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';
import { aspectRatioField } from '../fields/aspect-ratio-field';

export const galleryBlock = coreBlock(galleryBlockContract, {
  label: 'blocks.gallery.label',
  category: 'content',
  icon: 'images',
  defaultProps: {
    images: [],
    columns: 'auto',
    aspectRatio: 'square',
    lightbox: false,
  },
  fields: [
    FieldBuilder.custom(
      'images',
      'blocks.gallery.fields.images.fieldLabel',
      'gallery',
    ),
    {
      kind: 'select',
      key: 'columns',
      label: 'blocks.gallery.fields.columns.fieldLabel',
      group: 'style',
      options: [
        { label: 'blocks.gallery.fields.columns.options.auto', value: 'auto' },
        { label: 'blocks.gallery.fields.columns.options.2', value: '2' },
        { label: 'blocks.gallery.fields.columns.options.3', value: '3' },
        { label: 'blocks.gallery.fields.columns.options.4', value: '4' },
        { label: 'blocks.gallery.fields.columns.options.5', value: '5' },
        { label: 'blocks.gallery.fields.columns.options.6', value: '6' },
      ],
    },
    aspectRatioField,
    {
      kind: 'boolean',
      key: 'lightbox',
      label: 'blocks.image.fields.lightbox.fieldLabel',
    },
  ],
});
