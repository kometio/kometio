import { productReviewBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { testimonialBlock } from './testimonial.block';

/**
 * A testimonial about a product: the same fields, drawn by the same
 * component. Its own entry so that a shop finds it among the shop's
 * blocks, not so that there are two of the same thing to maintain — the
 * fields are the Testimonial's own, labels included.
 */
export const productReviewBlock = coreBlock(productReviewBlockContract, {
  label: 'blocks.productReview.label',
  category: 'shop',
  icon: 'thumbs-up',
  defaultProps: { quote: '', author: '', role: '', avatar: null, rating: 5 },
  fields: testimonialBlock.fields,
});
