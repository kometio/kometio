import type { TestimonialsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { displayField } from '../fields/display-field';

export const testimonialsBlock: BlockDescriptor<TestimonialsProps> = {
  type: 'Testimonials',
  label: 'blocks.testimonials.label',
  category: 'socialProof',
  icon: 'message-square-quote',
  defaultProps: { display: 'slider' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['Testimonial'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Testimonials,
};
