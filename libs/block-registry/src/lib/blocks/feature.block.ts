import type { FeatureProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const featureBlock: BlockDescriptor<FeatureProps> = {
  type: 'Feature',
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
  // STANDARD plus `gap`: the `inline` variant makes this block a flex
  // row, so the distance between the icon and the words is now a real
  // thing to set — offering it before the variant existed would have been
  // a control that did nothing.
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Feature,
};
