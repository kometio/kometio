import { ratingBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const ratingBlock = coreBlock(ratingBlockContract, {
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
});
