import type { PromoBarProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { ctaLinkFields } from '../fields/link-type-field';
import { visibilityField } from '../fields/visibility-field';

export const promoBarBlock: BlockDescriptor<PromoBarProps> = {
  type: 'PromoBar',
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
  // Replaces the old `colorOverride` — see button.block.ts.
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.PromoBar,
};
