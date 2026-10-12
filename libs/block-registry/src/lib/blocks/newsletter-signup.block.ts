import { newsletterSignupBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const newsletterSignupBlock = coreBlock(newsletterSignupBlockContract, {
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
});
