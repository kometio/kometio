import { beforeAfterBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

export const beforeAfterBlock = coreBlock(beforeAfterBlockContract, {
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
});
