import type { PageGridProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * The pages filed under one term (docs/adr/0064). It is what a term's
 * default layout is built from, and the same block an author can place
 * by hand anywhere — "the three articles in this category, here".
 *
 * `items` is not a field: it is filled in by the render pass, the same
 * way a picked page's address is. Offering it as an input would let
 * somebody type a list that has nothing to do with the term.
 */
export const pageGridBlock: BlockDescriptor<PageGridProps> = {
  type: 'PageGrid',
  label: 'blocks.pageGrid.label',
  category: 'content',
  icon: 'layout-grid',
  defaultProps: {
    termId: null,
    authorId: null,
    layout: 'list',
    order: 'title',
    limit: 0,
    perPage: 0,
    emptyText: '',
    items: [],
  },
  fields: [
    {
      kind: 'custom',
      key: 'termId',
      label: 'blocks.pageGrid.fields.termId.fieldLabel',
      control: 'term',
      required: true,
    },
    {
      kind: 'radio',
      key: 'layout',
      label: 'blocks.pageGrid.fields.layout.fieldLabel',
      group: 'style',
      options: [
        { label: 'blocks.pageGrid.fields.layout.options.list', value: 'list' },
        { label: 'blocks.pageGrid.fields.layout.options.grid', value: 'grid' },
        {
          label: 'blocks.pageGrid.fields.layout.options.cards',
          value: 'cards',
        },
      ],
    },
    {
      // Where an archive of news differs from a category of documentation:
      // one is read newest first, the other alphabetically.
      kind: 'radio',
      key: 'order',
      label: 'blocks.pageGrid.fields.order.fieldLabel',
      group: 'style',
      options: [
        { label: 'blocks.pageGrid.fields.order.options.title', value: 'title' },
        {
          label: 'blocks.pageGrid.fields.order.options.newest',
          value: 'newest',
        },
      ],
    },
    {
      kind: 'number',
      key: 'limit',
      label: 'blocks.pageGrid.fields.limit.fieldLabel',
      min: 0,
      max: 100,
      group: 'advanced',
    },
    {
      // An archive nobody can page through is an archive of its first
      // ten articles: everything older is written, published, and
      // unreachable.
      kind: 'number',
      key: 'perPage',
      label: 'blocks.pageGrid.fields.perPage.fieldLabel',
      min: 0,
      max: 100,
      group: 'advanced',
    },
    {
      kind: 'text',
      key: 'emptyText',
      translatable: true,
      label: 'blocks.pageGrid.fields.emptyText.fieldLabel',
      group: 'advanced',
    },
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.PageGrid,
};
