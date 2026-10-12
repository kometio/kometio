import { searchBoxBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { visibilityField } from '../fields/visibility-field';

export const searchBoxBlock = coreBlock(searchBoxBlockContract, {
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
});
