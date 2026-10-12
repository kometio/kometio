import { subPagesBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

/**
 * The pages filed under this one, or under one chosen by hand.
 *
 * The list is the page tree's answer, filled in when the page is read: a
 * section's index page that listed its children by hand would forget the
 * next one added.
 */
export const subPagesBlock = coreBlock(subPagesBlockContract, {
  label: 'blocks.subPages.label',
  category: 'content',
  icon: 'folder-tree',
  defaultProps: { parent: null, layout: 'list', limit: 0, items: [] },
  fields: [
    FieldBuilder.custom(
      'parent',
      'blocks.subPages.fields.parent.fieldLabel',
      'page',
    ),
    {
      kind: 'radio',
      key: 'layout',
      label: 'blocks.subPages.fields.layout.fieldLabel',
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
      kind: 'number',
      key: 'limit',
      label: 'blocks.subPages.fields.limit.fieldLabel',
      min: 0,
      max: 100,
      group: 'advanced',
    },
  ],
});
