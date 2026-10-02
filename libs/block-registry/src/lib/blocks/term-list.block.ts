import type { TermListProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * The terms of one dimension, offered to a reader.
 *
 * The block the archive was missing: a site could classify its pages
 * since ADR-0064 and a visitor could only ever see the whole list. Which
 * terms exist is a query, not a field — a row of chips typed by hand
 * would be a second copy of the site's classification, wrong the first
 * time somebody adds a term.
 *
 * `behaviour` is the one real choice. Filtering narrows the lists already
 * on this page and keeps the reader here; browsing sends them to the
 * term's own page, which is a different promise made by the same row of
 * chips.
 */
export const termListBlock: BlockDescriptor<TermListProps> = {
  type: 'TermList',
  label: 'blocks.termList.label',
  category: 'content',
  icon: 'tags',
  defaultProps: {
    taxonomyId: null,
    behaviour: 'filter',
    style: 'chips',
    showAll: true,
    choices: [],
  },
  fields: [
    {
      kind: 'custom',
      key: 'taxonomyId',
      label: 'blocks.termList.fields.taxonomyId.fieldLabel',
      control: 'taxonomy',
      required: true,
    },
    {
      kind: 'radio',
      key: 'behaviour',
      label: 'blocks.termList.fields.behaviour.fieldLabel',
      options: [
        {
          label: 'blocks.termList.fields.behaviour.options.filter',
          value: 'filter',
        },
        {
          label: 'blocks.termList.fields.behaviour.options.browse',
          value: 'browse',
        },
      ],
    },
    {
      kind: 'radio',
      key: 'style',
      label: 'blocks.termList.fields.style.fieldLabel',
      group: 'style',
      options: [
        { label: 'blocks.termList.fields.style.options.chips', value: 'chips' },
        {
          label: 'blocks.termList.fields.style.options.buttons',
          value: 'buttons',
        },
        { label: 'blocks.termList.fields.style.options.links', value: 'links' },
        {
          label: 'blocks.termList.fields.style.options.dropdown',
          value: 'dropdown',
        },
      ],
    },
    {
      // Only where it means something: browsing has no "all", because the
      // page the reader is already on is the whole list.
      kind: 'boolean',
      key: 'showAll',
      label: 'blocks.termList.fields.showAll.fieldLabel',
      showWhen: { field: 'behaviour', equals: 'filter' },
    },
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.TermList,
};
