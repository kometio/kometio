import type { EmbedHtmlProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

export const embedHtmlBlock: BlockDescriptor<EmbedHtmlProps> = {
  type: 'EmbedHtml',
  label: 'blocks.embedHtml.label',
  category: 'content',
  icon: 'code-xml',
  defaultProps: {
    html: '',
  },
  fields: [
    {
      kind: 'textarea',
      key: 'html',
      label: 'blocks.embedHtml.fields.html.fieldLabel',
    },
  ],
  // No textColor: the content is arbitrary HTML pasted by the user,
  // which often already carries its own color — only the "frame" space
  // (background/corners/padding) makes sense here.
  stylableProperties: [
    'backgroundColor',
    'borderRadius',
    'paddingX',
    'paddingY',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.EmbedHtml,
};
