import type { HeroProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

export const heroBlock: BlockDescriptor<HeroProps> = {
  type: 'Hero',
  label: 'blocks.hero.label',
  category: 'content',
  icon: 'layout-panel-top',
  defaultProps: {
    eyebrow: '',
    title: 'Titolo',
    subtitle: 'Sottotitolo',
  },
  fields: [
    {
      kind: 'text',
      key: 'eyebrow',
      translatable: true,
      label: 'blocks.hero.fields.eyebrow.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      label: 'blocks.hero.fields.title.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'richtext',
      key: 'subtitle',
      translatable: true,
      label: 'blocks.hero.fields.subtitle.fieldLabel',
      inlineEditable: true,
    },
  ],
  stylableProperties: [
    'backgroundColor',
    'textColor',
    'borderRadius',
    'boxShadow',
    'backgroundImage',
    'backgroundPosition',
    'backgroundSize',
    'backgroundRepeat',
    'overlayColor',
    'minHeight',
    // New with ADR-0056, now that the block is a flex container: an
    // alignment control on a block that was not one would have done
    // nothing, which is why the previous comment in Hero.astro refused
    // to offer it.
    'contentAlign',
    'gap',
    'paddingX',
    'paddingY',
    'maxWidth',
  ],
  // A Hero holds blocks now: a Button under the subtitle is what every
  // landing page opens with, and it belongs inside the hero's background
  // and padding rather than in a separate block below it.
  isContainer: true,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Hero,
};
