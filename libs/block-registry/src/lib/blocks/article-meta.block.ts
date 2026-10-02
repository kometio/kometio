import type { ArticleMetaProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * The line an article carries: when it went out, and who wrote it.
 *
 * Neither value is a field. They are filled in by the render pass from the
 * page the block sits on (resolveArticleBlocks), for the same reason a
 * PageGrid's items are: a date somebody typed would be a second answer to
 * a question the page already answers, and the two would disagree the
 * first time the page was republished.
 *
 * What IS a choice is whether to show each of them — a newsroom wants
 * both, a documentation site often wants neither.
 */
export const articleMetaBlock: BlockDescriptor<ArticleMetaProps> = {
  type: 'ArticleMeta',
  label: 'blocks.articleMeta.label',
  category: 'content',
  icon: 'calendar',
  defaultProps: {
    showDate: true,
    showAuthor: true,
    publishedAt: null,
    authorName: '',
    authorPath: null,
  },
  fields: [
    {
      kind: 'boolean',
      key: 'showDate',
      label: 'blocks.articleMeta.fields.showDate.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'showAuthor',
      label: 'blocks.articleMeta.fields.showAuthor.fieldLabel',
    },
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ArticleMeta,
};
