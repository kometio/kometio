import { glossaryBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/** Terms and what they mean, with an A–Z index over them. */
export const glossaryBlock = coreBlock(glossaryBlockContract, {
  label: 'blocks.glossary.label',
  category: 'content',
  icon: 'book-a',
  defaultProps: { showIndex: true },
  fields: [
    {
      kind: 'boolean',
      key: 'showIndex',
      label: 'blocks.glossary.fields.showIndex.fieldLabel',
    },
  ],
  isContainer: true,
  rendersFromChildren: true,
  allowedChildTypes: ['GlossaryTerm'],
});
