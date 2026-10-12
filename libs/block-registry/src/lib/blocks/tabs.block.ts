import { tabsBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const tabsBlock = coreBlock(tabsBlockContract, {
  label: 'blocks.tabs.label',
  category: 'interactive',
  icon: 'folder',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['Tab'],
});
