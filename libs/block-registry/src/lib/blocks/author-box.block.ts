import type { AuthorBoxProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * Who wrote this: their picture, their name, a few lines about them, and
 * the way to everything else they wrote (docs/adr/0071).
 *
 * The person is not a field. The render pass fills them in from the page
 * the block sits on, like ArticleMeta's byline: a bio typed into a block
 * would be a copy of the one in the person's profile, and the two would
 * part ways the first time they edited it.
 */
export const authorBoxBlock: BlockDescriptor<AuthorBoxProps> = {
  type: 'AuthorBox',
  label: 'blocks.authorBox.label',
  category: 'content',
  icon: 'user-pen',
  defaultProps: {
    showBio: true,
    showArticlesLink: true,
    author: null,
    isProfilePage: false,
  },
  fields: [
    {
      kind: 'boolean',
      key: 'showBio',
      label: 'blocks.authorBox.fields.showBio.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'showArticlesLink',
      label: 'blocks.authorBox.fields.showArticlesLink.fieldLabel',
    },
  ],
  stylableProperties: [
    ...BlockStyleRegistry.STANDARD,
    'borderWidth',
    'borderStyle',
    'borderColor',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.AuthorBox,
};
