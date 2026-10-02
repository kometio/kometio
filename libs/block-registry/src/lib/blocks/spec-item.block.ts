import type { SpecItemProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

export const specItemBlock: BlockDescriptor<SpecItemProps> = {
  type: 'SpecItem',
  label: 'blocks.specItem.label',
  category: 'content',
  icon: 'equal',
  defaultProps: { label: '', value: '' },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.specItem.fields.label.fieldLabel',
    },
    {
      kind: 'text',
      key: 'value',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.specItem.fields.value.fieldLabel',
    },
  ],
  // A term and its description belong to a description list: outside one
  // they are markup with no meaning.
  allowedParentTypes: ['SpecList'],
  // No radius: a row is drawn by one rule under it, and a site-wide
  // radius (a theme sets one at :root) bent that rule's ends.
  stylableProperties: ['backgroundColor', 'textColor', 'paddingX', 'paddingY'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.SpecItem,
};
