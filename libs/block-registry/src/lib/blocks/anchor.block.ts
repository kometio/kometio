import type { AnchorProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

/**
 * A place in the page a link can land on — `/prices#table`.
 *
 * Its own block rather than a field on every other one: the reader of a
 * long page wants to jump to a spot, and the spot is not always a heading.
 * The name is written as a slug when the page renders, so it is always a
 * valid `id` whatever was typed.
 */
export const anchorBlock: BlockDescriptor<AnchorProps> = {
  type: 'Anchor',
  label: 'blocks.anchor.label',
  category: 'layout',
  icon: 'anchor',
  defaultProps: { name: '' },
  fields: [
    // Not translatable: a link someone shared to `#prezzi` has to keep
    // landing on the same spot in every language the page is read in.
    {
      kind: 'text',
      key: 'name',
      label: 'blocks.anchor.fields.name.fieldLabel',
    },
  ],
  stylableProperties: [],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Anchor,
};
