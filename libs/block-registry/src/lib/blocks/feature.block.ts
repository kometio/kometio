import { featureBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

export const featureBlock = coreBlock(featureBlockContract, {
  label: 'blocks.feature.label',
  category: 'interactive',
  icon: 'badge-check',
  defaultProps: {
    icon: null,
    title: 'Titolo della feature',
    text: 'Descrizione della feature...',
  },
  fields: [
    FieldBuilder.custom(
      'icon',
      'blocks.feature.fields.icon.fieldLabel',
      'icon',
    ),
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      label: 'blocks.feature.fields.title.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'richtext',
      key: 'text',
      translatable: true,
      label: 'blocks.feature.fields.text.fieldLabel',
      inlineEditable: true,
    },
  ],
  // Presentation, so variants rather than props (ADR-0048): a feature
  // with its icon beside the words, or with its column of text ranged
  // left, is the same feature wearing a different look — and a theme may
  // add its own on top (ADR-0048's .variants.ts).
  variants: [
    { value: 'inline', label: 'blocks.feature.variants.inline' },
    { value: 'start', label: 'blocks.feature.variants.start' },
  ],
});
