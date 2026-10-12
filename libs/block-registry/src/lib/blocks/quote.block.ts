import { quoteBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const quoteBlock = coreBlock(quoteBlockContract, {
  label: 'blocks.quote.label',
  category: 'content',
  icon: 'quote',
  defaultProps: {
    quote: 'Testo della citazione...',
    author: '',
    role: '',
  },
  fields: [
    {
      kind: 'richtext',
      key: 'quote',
      translatable: true,
      label: 'blocks.quote.fields.quote.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'author',
      label: 'blocks.quote.fields.author.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'role',
      translatable: true,
      label: 'blocks.quote.fields.role.fieldLabel',
      inlineEditable: true,
    },
  ],
});
