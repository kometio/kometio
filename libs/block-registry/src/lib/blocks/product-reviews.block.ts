import type { ProductReviewsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { displayField } from '../fields/display-field';

/**
 * Reviews of one product, with the schema.org data a search engine shows
 * as stars — off until somebody names the product and turns it on, since
 * a review rich result is a claim that gets checked.
 */
export const productReviewsBlock: BlockDescriptor<ProductReviewsProps> = {
  type: 'ProductReviews',
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
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ProductReviews,
};
