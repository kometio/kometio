import type { ShareButtonsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

const NETWORKS = [
  'whatsapp',
  'facebook',
  'linkedin',
  'x',
  'email',
  'copyLink',
] as const;

/**
 * Share this page. Plain links to each network's share page — no script
 * from Facebook or anyone else loads until a visitor presses one, so
 * there is nothing here for a cookie banner to ask about.
 */
export const shareButtonsBlock: BlockDescriptor<ShareButtonsProps> = {
  type: 'ShareButtons',
  label: 'blocks.shareButtons.label',
  category: 'conversion',
  icon: 'forward',
  defaultProps: {
    label: '',
    whatsapp: true,
    facebook: true,
    linkedin: true,
    x: false,
    email: true,
    copyLink: true,
  },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.shareButtons.fields.label.fieldLabel',
    },
    ...NETWORKS.map((network) => ({
      kind: 'boolean' as const,
      key: network,
      label: `blocks.shareButtons.fields.${network}.fieldLabel`,
    })),
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ShareButtons,
};
