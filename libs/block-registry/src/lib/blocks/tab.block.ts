import type { BlockDescriptor } from '../field-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { BlockStyleRegistry } from '../block-style-registry';

// `label` is not part of `TabProps` in the domain (content-model.ts) —
// actually it is: TabProps = { label: string }. No extra Puck-only type
// is needed here, unlike Nav/Column/etc: Tab has no `children` prop
// separate from the real Block.children, so no extra interface like
// Puck's *PuckProps is needed.
export const tabBlock: BlockDescriptor<{ label: string }> = {
  type: 'Tab',
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
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Tab,
};
