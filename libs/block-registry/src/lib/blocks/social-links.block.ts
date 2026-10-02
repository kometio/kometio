import {
  BLOCK_STYLE_DEFAULTS,
  type SocialLinksProps,
} from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { displayField } from '../fields/display-field';

export const socialLinksBlock: BlockDescriptor<SocialLinksProps> = {
  type: 'SocialLinks',
  label: 'blocks.socialLinks.label',
  category: 'conversion',
  icon: 'share-2',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['SocialLink'],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.SocialLinks,
};
