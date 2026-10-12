import { imageHotspotsBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

/** A picture with points on it that open a short explanation. */
export const imageHotspotsBlock = coreBlock(imageHotspotsBlockContract, {
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
});
