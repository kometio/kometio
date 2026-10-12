import { textBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const textBlock = coreBlock(textBlockContract, {
  label: 'blocks.text.label',
  category: 'content',
  icon: 'type',
  defaultProps: {
    body: 'Testo del blocco...',
  },
  fields: [
    {
      kind: 'richtext',
      key: 'body',
      translatable: true,
      label: 'blocks.text.fields.body.fieldLabel',
      inlineEditable: true,
    },
  ],
});
