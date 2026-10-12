import { productReviewsBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { displayField } from '../fields/display-field';

/**
 * Reviews of one product, with the schema.org data a search engine shows
 * as stars — off until somebody names the product and turns it on, since
 * a review rich result is a claim that gets checked.
 */
export const productReviewsBlock = coreBlock(productReviewsBlockContract, {
  label: 'blocks.productReviews.label',
  category: 'shop',
  icon: 'message-square-heart',
  defaultProps: { display: 'grid', structuredData: false, productName: '' },
  fields: [
    displayField,
    {
      kind: 'boolean',
      key: 'structuredData',
      label: 'blocks.productReviews.fields.structuredData.fieldLabel',
      group: 'advanced',
    },
    {
      kind: 'text',
      key: 'productName',
      translatable: true,
      required: true,
      label: 'blocks.productReviews.fields.productName.fieldLabel',
      group: 'advanced',
      showWhen: { field: 'structuredData', equals: true },
    },
  ],
  isContainer: true,
  rendersFromChildren: true,
  allowedChildTypes: ['ProductReview'],
});
