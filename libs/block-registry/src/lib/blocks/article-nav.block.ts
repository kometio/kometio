import type { ArticleNavProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * The way on to the article before and the article after.
 *
 * "Before" and "after" mean by date, inside the section this page belongs
 * to — the order a reader moving through an archive expects. A page that
 * is in no section has no such set, and the block draws nothing rather
 * than offering whatever happens to sit beside it in the page tree.
 *
 * It has no fields at all: both ends are answers, not choices.
 */
export const articleNavBlock: BlockDescriptor<ArticleNavProps> = {
  type: 'ArticleNav',
  label: 'blocks.articleNav.label',
  category: 'content',
  icon: 'arrow-left-right',
  defaultProps: {
    previous: null,
    next: null,
  },
  fields: [],
  stylableProperties: [...BlockStyleRegistry.STANDARD],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ArticleNav,
};
