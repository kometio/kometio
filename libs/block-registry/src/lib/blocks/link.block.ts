import { linkBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { ctaLinkFields } from '../fields/link-type-field';

export const linkBlock = coreBlock(linkBlockContract, {
  label: 'blocks.link.label',
  category: 'content',
  icon: 'link',
  defaultProps: {
    label: 'Scopri di più',
    linkType: 'page',
    page: null,
    url: '',
  },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.link.fields.label.fieldLabel',
      inlineEditable: true,
    },
    ...ctaLinkFields(),
  ],
});
