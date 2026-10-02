import type { GlossaryTermProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const glossaryTermBlock: BlockDescriptor<GlossaryTermProps> = {
  type: 'GlossaryTerm',
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
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.GlossaryTerm,
};
