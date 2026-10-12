import { embedHtmlBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const embedHtmlBlock = coreBlock(embedHtmlBlockContract, {
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
});
