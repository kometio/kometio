import type { StepProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const stepBlock: BlockDescriptor<StepProps> = {
  type: 'Step',
  label: 'blocks.step.label',
  category: 'content',
  icon: 'footprints',
  defaultProps: { title: '', description: '' },
  fields: [
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.step.fields.title.fieldLabel',
    },
    {
      kind: 'richtext',
      key: 'description',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.step.fields.description.fieldLabel',
    },
  ],
  // An <li> counted by its list: outside one it has no number and no list.
  allowedParentTypes: ['Steps'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Step,
};
