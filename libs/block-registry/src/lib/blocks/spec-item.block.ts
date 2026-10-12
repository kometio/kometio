import { specItemBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const specItemBlock = coreBlock(specItemBlockContract, {
  label: 'blocks.specItem.label',
  category: 'content',
  icon: 'equal',
  defaultProps: { label: '', value: '' },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.specItem.fields.label.fieldLabel',
    },
    {
      kind: 'text',
      key: 'value',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.specItem.fields.value.fieldLabel',
    },
  ],
  // A term and its description belong to a description list: outside one
  // they are markup with no meaning.
  allowedParentTypes: ['SpecList'],
});
