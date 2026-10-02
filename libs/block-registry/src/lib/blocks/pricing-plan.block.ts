import type { PricingPlanProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { ctaLinkFields } from '../fields/link-type-field';

export const pricingPlanBlock: BlockDescriptor<PricingPlanProps> = {
  type: 'PricingPlan',
  label: 'blocks.pricingPlan.label',
  category: 'socialProof',
  icon: 'tag',
  defaultProps: {
    name: 'Base',
    price: '9€',
    period: '/mese',
    features: ['Caratteristica 1', 'Caratteristica 2'],
    highlighted: false,
    buttonLabel: 'Scegli piano',
    linkType: 'page',
    page: null,
    url: '',
  },
  fields: [
    {
      kind: 'text',
      key: 'name',
      translatable: true,
      label: 'blocks.pricingPlan.fields.name.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'price',
      translatable: true,
      label: 'blocks.pricingPlan.fields.price.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'period',
      translatable: true,
      label: 'blocks.pricingPlan.fields.period.fieldLabel',
      inlineEditable: true,
    },
    FieldBuilder.custom(
      'features',
      'blocks.pricingPlan.fields.features.fieldLabel',
      'feature-list',
    ),
    // Replaces Puck's boolean-valued radio (options with
    // value: true/false) — a toggle fits a binary flag better.
    {
      kind: 'boolean',
      key: 'highlighted',
      label: 'blocks.pricingPlan.fields.highlighted.fieldLabel',
    },
    {
      kind: 'text',
      key: 'buttonLabel',
      translatable: true,
      label: 'blocks.pricingPlan.fields.buttonLabel.fieldLabel',
      inlineEditable: true,
    },
    ...ctaLinkFields(),
  ],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.PricingPlan,
};
