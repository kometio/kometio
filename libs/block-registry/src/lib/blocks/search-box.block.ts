import type { SearchBoxProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { visibilityField } from '../fields/visibility-field';

export const searchBoxBlock: BlockDescriptor<SearchBoxProps> = {
  type: 'SearchBox',
  label: 'blocks.searchBox.label',
  category: 'conversion',
  icon: 'search',
  defaultProps: {
    placeholder: 'Cerca nel sito...',
    visibility: 'always',
  },
  fields: [
    {
      kind: 'text',
      key: 'placeholder',
      translatable: true,
      label: 'blocks.searchBox.fields.placeholder.fieldLabel',
    },
    visibilityField,
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.SearchBox,
};
