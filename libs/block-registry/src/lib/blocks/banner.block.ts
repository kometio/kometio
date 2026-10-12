import { bannerBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { ctaLinkFields } from '../fields/link-type-field';

export const bannerBlock = coreBlock(bannerBlockContract, {
  label: 'blocks.banner.label',
  category: 'conversion',
  icon: 'megaphone',
  defaultProps: {
    title: 'Titolo del banner',
    text: 'Testo del banner...',
    buttonLabel: 'Scopri di più',
    linkType: 'page',
    page: null,
    url: '',
  },
  fields: [
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      label: 'blocks.banner.fields.title.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'richtext',
      key: 'text',
      translatable: true,
      label: 'blocks.banner.fields.text.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'buttonLabel',
      translatable: true,
      label: 'blocks.banner.fields.buttonLabel.fieldLabel',
      inlineEditable: true,
    },
    ...ctaLinkFields(),
  ],
  // Presentation, so variants and not props (ADR-0048). `split` is the
  // call-to-action bar — words on one side, button on the other — which
  // is what a banner looks like on most sites and was the one shape this
  // block could not make. `outline` is the quiet version, for a page that
  // already has a filled block above it.
  variants: [
    { value: 'split', label: 'blocks.banner.variants.split' },
    { value: 'outline', label: 'blocks.banner.variants.outline' },
  ],
});
