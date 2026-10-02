import type { ImageProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { aspectRatioField } from '../fields/aspect-ratio-field';

export const imageBlock: BlockDescriptor<ImageProps> = {
  type: 'Image',
  label: 'blocks.image.label',
  category: 'content',
  icon: 'image',
  defaultProps: {
    media: null,
    alt: '',
    isDecorative: false,
    caption: '',
    linkType: 'none',
    page: null,
    url: '',
    lightbox: false,
    alignment: 'center',
    aspectRatio: 'original',
  },
  fields: [
    FieldBuilder.custom(
      'media',
      'blocks.image.fields.media.fieldLabel',
      'media',
    ),
    // alt is not inlineEditable: it's an attribute (no visible text node
    // in the DOM), not content that can be edited on the canvas.
    {
      kind: 'text',
      key: 'alt',
      translatable: true,
      label: 'blocks.image.fields.alt.fieldLabel',
      required: true,
      // Both, and they are not the same statement: `requiredUnless`
      // says an empty value is legitimate here, `showWhen` says the
      // question is not worth asking at all. A decorative image is
      // `alt=""` by definition, so the field it would be typed into is
      // noise — while any OTHER reader of the descriptor still learns
      // from `requiredUnless` that the emptiness is deliberate.
      requiredUnless: 'isDecorative',
      // What the library holds for the file, when the block says nothing of
      // its own: the text written once in Media is what every use of the
      // file says.
      fallbackFrom: 'media.alt',
      showWhen: { field: 'isDecorative', equals: false },
    },
    {
      kind: 'boolean',
      key: 'isDecorative',
      label: 'blocks.image.fields.isDecorative.fieldLabel',
    },
    {
      kind: 'text',
      key: 'caption',
      translatable: true,
      label: 'blocks.image.fields.caption.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'select',
      key: 'alignment',
      label: 'blocks.shared.alignment.fieldLabel',
      group: 'style',
      options: [
        { label: 'blocks.shared.alignment.options.start', value: 'start' },
        { label: 'blocks.shared.alignment.options.center', value: 'center' },
        { label: 'blocks.shared.alignment.options.end', value: 'end' },
      ],
    },
    aspectRatioField,
    {
      kind: 'select',
      key: 'linkType',
      label: 'blocks.image.fields.linkType.fieldLabel',
      options: [
        { label: 'blocks.image.fields.linkType.options.none', value: 'none' },
        { label: 'blocks.image.fields.linkType.options.page', value: 'page' },
        { label: 'blocks.image.fields.linkType.options.url', value: 'url' },
      ],
    },
    // Not `ctaLinkFields()`: this block's linkType has a third option
    // ("none"), and its labels are its own — but the visibility rule is
    // the same one, so the two fields follow the choice here too.
    FieldBuilder.custom(
      'page',
      'blocks.shared.linkType.pageFieldLabel',
      'page',
      { showWhen: { field: 'linkType', equals: 'page' }, required: true },
    ),
    {
      kind: 'text',
      key: 'url',
      showWhen: { field: 'linkType', equals: 'url' },
      required: true,
      label: 'blocks.shared.linkType.urlFieldLabel',
      placeholder: 'https://',
    },
    {
      kind: 'boolean',
      key: 'lightbox',
      label: 'blocks.image.fields.lightbox.fieldLabel',
    },
  ],
  stylableProperties: [
    'borderRadius',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'boxShadow',
    'maxWidth',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Image,
};
