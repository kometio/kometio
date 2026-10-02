import type { GlossaryProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/** Terms and what they mean, with an A–Z index over them. */
export const glossaryBlock: BlockDescriptor<GlossaryProps> = {
  type: 'Glossary',
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
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Glossary,
};
