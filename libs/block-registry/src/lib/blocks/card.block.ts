import type { CardProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';

export const cardBlock: BlockDescriptor<CardProps> = {
  type: 'Card',
  label: 'blocks.card.label',
  category: 'layout',
  icon: 'square-stack',
  defaultProps: {
    media: null,
    alt: '',
    isDecorative: false,
  },
  fields: [
    FieldBuilder.custom(
      'media',
      'blocks.card.fields.media.fieldLabel',
      'media',
    ),
    // Image's own pair, same rules: `alt` is an attribute and not a text
    // node, so it is not inline-editable, and the decorative flag is the
    // deliberate-choice escape hatch rather than a way to skip the field.
    {
      kind: 'text',
      key: 'alt',
      translatable: true,
      label: 'blocks.card.fields.alt.fieldLabel',
      required: true,
      requiredUnless: 'isDecorative',
      // Image's rule too: what the library holds for the file is what the
      // card says while it has no text of its own.
      fallbackFrom: 'media.alt',
    },
    {
      kind: 'boolean',
      key: 'isDecorative',
      label: 'blocks.card.fields.isDecorative.fieldLabel',
    },
  ],
  // No allowedChildTypes, for Container's reason: a card holds whatever
  // the card is about.
  isContainer: true,
  // Presentation, so variants and not props (ADR-0048). `elevated` and
  // `flat` are the two other looks every design system ships beside the
  // outlined default; `horizontal` puts the picture beside the words,
  // which is the list-item card and not a different block.
  variants: [
    { value: 'elevated', label: 'blocks.card.variants.elevated' },
    { value: 'flat', label: 'blocks.card.variants.flat' },
    { value: 'horizontal', label: 'blocks.card.variants.horizontal' },
  ],
  stylableProperties: [
    'backgroundColor',
    'textColor',
    'borderRadius',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'boxShadow',
    'paddingX',
    'paddingY',
    'gap',
    'contentAlign',
    'maxWidth',
    'minHeight',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Card,
};
