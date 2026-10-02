import type { TextProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

export const textBlock: BlockDescriptor<TextProps> = {
  type: 'Text',
  label: 'blocks.text.label',
  category: 'content',
  icon: 'type',
  defaultProps: {
    body: 'Testo del blocco...',
  },
  fields: [
    {
      kind: 'richtext',
      key: 'body',
      translatable: true,
      label: 'blocks.text.fields.body.fieldLabel',
      inlineEditable: true,
    },
  ],
  stylableProperties: ['textColor'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Text,
};
