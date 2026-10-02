import type { ShippingReturnsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor, FieldDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

const SECTIONS = ['shipping', 'returns', 'support'] as const;

/** A title and a text for each of the three things a buyer asks before paying. */
function sectionFields(section: (typeof SECTIONS)[number]): FieldDescriptor[] {
  return [
    {
      kind: 'text',
      key: `${section}Title`,
      translatable: true,
      inlineEditable: true,
      label: `blocks.shippingReturns.fields.${section}Title.fieldLabel`,
    },
    {
      kind: 'richtext',
      key: `${section}Text`,
      translatable: true,
      inlineEditable: true,
      label: `blocks.shippingReturns.fields.${section}Text.fieldLabel`,
    },
  ];
}

/**
 * Shipping, returns and help, side by side. A section left empty is not
 * drawn: a shop that ships nothing has no shipping to talk about.
 */
export const shippingReturnsBlock: BlockDescriptor<ShippingReturnsProps> = {
  type: 'ShippingReturns',
  label: 'blocks.shippingReturns.label',
  category: 'shop',
  icon: 'truck',
  defaultProps: {
    shippingTitle: '',
    shippingText: '',
    returnsTitle: '',
    returnsText: '',
    supportTitle: '',
    supportText: '',
  },
  fields: SECTIONS.flatMap(sectionFields),
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ShippingReturns,
};
