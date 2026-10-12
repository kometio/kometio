import { tableOfContentsBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * The page's own headings, as links to them.
 *
 * The entries are not a field: the render pass reads them off the page
 * and gives each heading the anchor its link points at. One kept by hand
 * is wrong the first time a heading is renamed.
 */
export const tableOfContentsBlock = coreBlock(tableOfContentsBlockContract, {
  label: 'blocks.tableOfContents.label',
  category: 'content',
  icon: 'list-tree',
  defaultProps: { title: '', depth: 'h3', numbered: false, entries: [] },
  fields: [
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      label: 'blocks.tableOfContents.fields.title.fieldLabel',
    },
    {
      kind: 'radio',
      key: 'depth',
      label: 'blocks.tableOfContents.fields.depth.fieldLabel',
      options: [
        {
          label: 'blocks.tableOfContents.fields.depth.options.h2',
          value: 'h2',
        },
        {
          label: 'blocks.tableOfContents.fields.depth.options.h3',
          value: 'h3',
        },
      ],
    },
    {
      kind: 'boolean',
      key: 'numbered',
      label: 'blocks.tableOfContents.fields.numbered.fieldLabel',
      group: 'style',
    },
  ],
});
