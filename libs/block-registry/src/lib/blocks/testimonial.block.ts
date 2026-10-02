import type { TestimonialProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const testimonialBlock: BlockDescriptor<TestimonialProps> = {
  type: 'Testimonial',
  label: 'blocks.testimonial.label',
  category: 'socialProof',
  icon: 'message-square',
  defaultProps: {
    quote: 'Testo della recensione...',
    author: 'Nome Cognome',
    role: '',
    avatar: null,
    rating: 5,
  },
  fields: [
    {
      kind: 'richtext',
      key: 'quote',
      translatable: true,
      label: 'blocks.testimonial.fields.quote.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'author',
      label: 'blocks.testimonial.fields.author.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'role',
      translatable: true,
      label: 'blocks.testimonial.fields.role.fieldLabel',
      inlineEditable: true,
    },
    FieldBuilder.custom(
      'avatar',
      'blocks.testimonial.fields.avatar.fieldLabel',
      'media',
    ),
    {
      kind: 'number',
      key: 'rating',
      label: 'blocks.testimonial.fields.rating.fieldLabel',
      min: 1,
      max: 5,
      step: 1,
    },
  ],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Testimonial,
};
