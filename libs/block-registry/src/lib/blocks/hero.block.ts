import { heroBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const heroBlock = coreBlock(heroBlockContract, {
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
  // A Hero holds blocks now: a Button under the subtitle is what every
  // landing page opens with, and it belongs inside the hero's background
  // and padding rather than in a separate block below it.
  isContainer: true,
});
