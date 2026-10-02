import type { ProductCardProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { ctaLinkFields } from '../fields/link-type-field';
import { currencyField } from '../fields/currency-field';

/**
 * One product: a picture, a name, a price and where to buy it.
 *
 * There is no cart in Kometio, and the card does not pretend otherwise —
 * its link goes to the product's own page or to wherever it is sold.
 */
export const productCardBlock: BlockDescriptor<ProductCardProps> = {
  type: 'ProductCard',
  label: 'blocks.productCard.label',
  category: 'shop',
  icon: 'shopping-bag',
  defaultProps: {
    image: null,
    alt: '',
    name: '',
    description: '',
    price: null,
    compareAtPrice: null,
    currency: 'EUR',
    badge: '',
    linkType: 'url',
    page: null,
    url: '',
    structuredData: true,
  },
  fields: [
    FieldBuilder.custom(
      'image',
      'blocks.productCard.fields.image.fieldLabel',
      'media',
    ),
    {
      kind: 'text',
      key: 'alt',
      translatable: true,
      label: 'blocks.productCard.fields.alt.fieldLabel',
    },
    {
      kind: 'text',
      key: 'name',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.productCard.fields.name.fieldLabel',
    },
    {
      kind: 'textarea',
      key: 'description',
      translatable: true,
      label: 'blocks.productCard.fields.description.fieldLabel',
    },
    {
      kind: 'number',
      key: 'price',
      min: 0,
      step: 0.01,
      optional: true,
      label: 'blocks.shared.price.priceFieldLabel',
    },
    {
      kind: 'number',
      key: 'compareAtPrice',
      min: 0,
      step: 0.01,
      optional: true,
      label: 'blocks.shared.price.compareAtPriceFieldLabel',
    },
    currencyField,
    {
      kind: 'text',
      key: 'badge',
      translatable: true,
      label: 'blocks.productCard.fields.badge.fieldLabel',
    },
    ...ctaLinkFields({ required: false }),
    {
      kind: 'boolean',
      key: 'structuredData',
      label: 'blocks.productCard.fields.structuredData.fieldLabel',
      group: 'advanced',
    },
  ],
  stylableProperties: [
    ...BlockStyleRegistry.STANDARD,
    'borderWidth',
    'borderStyle',
    'borderColor',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ProductCard,
};
