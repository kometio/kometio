import { accordionItemBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const accordionItemBlock = coreBlock(accordionItemBlockContract, {
  label: 'blocks.accordionItem.label',
  category: 'interactive',
  icon: 'chevron-down',
  defaultProps: {
    question: 'Domanda...',
    answer: 'Risposta...',
  },
  fields: [
    {
      kind: 'text',
      key: 'question',
      translatable: true,
      label: 'blocks.accordionItem.fields.question.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'richtext',
      key: 'answer',
      translatable: true,
      label: 'blocks.accordionItem.fields.answer.fieldLabel',
      inlineEditable: true,
    },
  ],
});
