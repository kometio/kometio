import { stepBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const stepBlock = coreBlock(stepBlockContract, {
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
});
