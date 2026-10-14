import { embedHtmlBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const embedHtmlBlock = coreBlock(embedHtmlBlockContract, {
  label: 'blocks.embedHtml.label',
  category: 'content',
  icon: 'code-xml',
  defaultProps: {
    html: '',
    consentCategory: 'experience',
  },
  fields: [
    {
      kind: 'textarea',
      key: 'html',
      label: 'blocks.embedHtml.fields.html.fieldLabel',
    },
    {
      // What the visitor has to have agreed to before it runs (docs/adr/0131):
      // an embed is a third party's code, and it waits for the banner.
      kind: 'select',
      key: 'consentCategory',
      label: 'blocks.embedHtml.fields.consentCategory.fieldLabel',
      options: [
        {
          label: 'blocks.embedHtml.fields.consentCategory.options.experience',
          value: 'experience',
        },
        {
          label:
            'blocks.embedHtml.fields.consentCategory.options.functionality',
          value: 'functionality',
        },
        {
          label: 'blocks.embedHtml.fields.consentCategory.options.measurement',
          value: 'measurement',
        },
        {
          label: 'blocks.embedHtml.fields.consentCategory.options.necessary',
          value: 'necessary',
        },
      ],
    },
  ],
});
