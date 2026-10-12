import { socialLinksBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { displayField } from '../fields/display-field';

export const socialLinksBlock = coreBlock(socialLinksBlockContract, {
  label: 'blocks.socialLinks.label',
  category: 'conversion',
  icon: 'share-2',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['SocialLink'],
});
