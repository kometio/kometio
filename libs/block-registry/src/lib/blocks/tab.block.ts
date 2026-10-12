import { tabBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

// `label` is the whole of `TabProps` in the domain (layout-blocks.ts):
// TabProps = { label: string }. Tab has no `children` prop separate from
// the real Block.children, so it needs no type of its own here.
export const tabBlock = coreBlock(tabBlockContract, {
  label: 'blocks.tab.label',
  category: 'interactive',
  icon: 'file',
  defaultProps: { label: 'Tab' },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.tab.fields.label.fieldLabel',
    },
  ],
  isContainer: true,
  allowedChildTypes: ['Hero', 'Text', 'Image', 'Gallery', 'Form'],
  // Its label becomes a button only when Tabs builds the tab list around
  // its panels (block-behaviors/tabs.ts); anywhere else there is no tab.
  allowedParentTypes: ['Tabs'],
});
