import type { TabsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const tabsBlock: BlockDescriptor<TabsProps> = {
  type: 'Tabs',
  label: 'blocks.tabs.label',
  category: 'interactive',
  icon: 'folder',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['Tab'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Tabs,
};
