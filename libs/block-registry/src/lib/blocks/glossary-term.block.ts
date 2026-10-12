import { glossaryTermBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const glossaryTermBlock = coreBlock(glossaryTermBlockContract, {
  label: 'blocks.glossaryTerm.label',
  category: 'content',
  icon: 'whole-word',
  defaultProps: { term: '', definition: '' },
  fields: [
    {
      kind: 'text',
      key: 'term',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.glossaryTerm.fields.term.fieldLabel',
    },
    {
      kind: 'richtext',
      key: 'definition',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.glossaryTerm.fields.definition.fieldLabel',
    },
  ],
  // A term and its definition belong to the glossary's description list.
  allowedParentTypes: ['Glossary'],
});
