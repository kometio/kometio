import { promoBarBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { ctaLinkFields } from '../fields/link-type-field';
import { visibilityField } from '../fields/visibility-field';

export const promoBarBlock = coreBlock(promoBarBlockContract, {
  label: 'blocks.promoBar.label',
  category: 'chrome',
  icon: 'panel-top',
  defaultProps: {
    message: 'Messaggio promozionale...',
    linkType: 'page',
    page: null,
    url: '',
    visibility: 'always',
  },
  fields: [
    {
      kind: 'textarea',
      key: 'message',
      translatable: true,
      label: 'blocks.promoBar.fields.message.fieldLabel',
      inlineEditable: true,
    },
    ...ctaLinkFields(),
    visibilityField,
  ],
});
