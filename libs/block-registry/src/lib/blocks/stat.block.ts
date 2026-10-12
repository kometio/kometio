import { statBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const statBlock = coreBlock(statBlockContract, {
  label: 'blocks.stat.label',
  category: 'socialProof',
  icon: 'hash',
  defaultProps: {
    value: 100,
    prefix: '',
    suffix: '',
    label: 'Etichetta',
  },
  fields: [
    // Not inlineEditable: it drives the count-up animation on the
    // public site (StatsCounter.astro parses it directly), it must
    // stay a number.
    {
      kind: 'number',
      key: 'value',
      label: 'blocks.stat.fields.value.fieldLabel',
    },
    {
      kind: 'text',
      key: 'prefix',
      translatable: true,
      label: 'blocks.stat.fields.prefix.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'suffix',
      translatable: true,
      label: 'blocks.stat.fields.suffix.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.stat.fields.label.fieldLabel',
      inlineEditable: true,
    },
  ],
});
