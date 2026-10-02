import type { NewsletterSignupProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const newsletterSignupBlock: BlockDescriptor<NewsletterSignupProps> = {
  type: 'NewsletterSignup',
  label: 'blocks.newsletterSignup.label',
  category: 'conversion',
  icon: 'mail',
  defaultProps: {
    title: 'Iscriviti alla newsletter',
    buttonLabel: 'Iscrivimi',
  },
  fields: [
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      label: 'blocks.newsletterSignup.fields.title.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'buttonLabel',
      translatable: true,
      label: 'blocks.newsletterSignup.fields.buttonLabel.fieldLabel',
      inlineEditable: true,
    },
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'maxWidth'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.NewsletterSignup,
};
