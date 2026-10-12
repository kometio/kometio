import { listItemBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const listItemBlock = coreBlock(listItemBlockContract, {
  label: 'blocks.listItem.label',
  category: 'content',
  icon: 'dot',
  defaultProps: { text: '' },
  fields: [
    {
      kind: 'richtext',
      key: 'text',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.listItem.fields.text.fieldLabel',
    },
  ],
  allowedParentTypes: ['List'],
});
