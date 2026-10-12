import { relatedPagesBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * The other pages filed under the same terms as this one.
 *
 * The query and not a list kept by hand: an author picking related
 * articles would be maintaining a second index of the site, and it would
 * be wrong the day after it was written. A page with no terms has nothing
 * to be related to, and the block draws nothing.
 */
export const relatedPagesBlock = coreBlock(relatedPagesBlockContract, {
  label: 'blocks.relatedPages.label',
  category: 'content',
  icon: 'layers',
  defaultProps: {
    layout: 'cards',
    limit: 3,
    items: [],
  },
  fields: [
    {
      kind: 'radio',
      key: 'layout',
      label: 'blocks.relatedPages.fields.layout.fieldLabel',
      group: 'style',
      options: [
        {
          label: 'blocks.relatedPages.fields.layout.options.list',
          value: 'list',
        },
        {
          label: 'blocks.relatedPages.fields.layout.options.cards',
          value: 'cards',
        },
      ],
    },
    {
      kind: 'number',
      key: 'limit',
      label: 'blocks.relatedPages.fields.limit.fieldLabel',
      min: 1,
      max: 12,
      group: 'advanced',
    },
  ],
});
