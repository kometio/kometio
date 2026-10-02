import type { BeforeAfterProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';

export const beforeAfterBlock: BlockDescriptor<BeforeAfterProps> = {
  type: 'BeforeAfter',
  label: 'blocks.beforeAfter.label',
  category: 'media',
  icon: 'sliders-horizontal',
  defaultProps: {
    beforeImage: null,
    afterImage: null,
    beforeLabel: 'Prima',
    afterLabel: 'Dopo',
  },
  fields: [
    FieldBuilder.custom(
      'beforeImage',
      'blocks.beforeAfter.fields.beforeImage.fieldLabel',
      'media',
    ),
    FieldBuilder.custom(
      'afterImage',
      'blocks.beforeAfter.fields.afterImage.fieldLabel',
      'media',
    ),
    {
      kind: 'text',
      key: 'beforeLabel',
      translatable: true,
      label: 'blocks.beforeAfter.fields.beforeLabel.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'afterLabel',
      translatable: true,
      label: 'blocks.beforeAfter.fields.afterLabel.fieldLabel',
      inlineEditable: true,
    },
  ],
  stylableProperties: [
    'borderRadius',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'boxShadow',
    'maxWidth',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.BeforeAfter,
};
