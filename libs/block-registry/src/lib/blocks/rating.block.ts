import type { RatingProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const ratingBlock: BlockDescriptor<RatingProps> = {
  type: 'Rating',
  label: 'blocks.rating.label',
  category: 'media',
  icon: 'star',
  defaultProps: {
    rating: 5,
    label: 'Valutazione clienti',
  },
  fields: [
    {
      kind: 'number',
      key: 'rating',
      label: 'blocks.rating.fields.rating.fieldLabel',
      min: 1,
      max: 5,
      step: 1,
    },
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.rating.fields.label.fieldLabel',
      inlineEditable: true,
    },
  ],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Rating,
};
