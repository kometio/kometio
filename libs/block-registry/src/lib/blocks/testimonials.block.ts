import { testimonialsBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { displayField } from '../fields/display-field';

export const testimonialsBlock = coreBlock(testimonialsBlockContract, {
  label: 'blocks.testimonials.label',
  category: 'socialProof',
  icon: 'message-square-quote',
  defaultProps: { display: 'slider' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['Testimonial'],
});
